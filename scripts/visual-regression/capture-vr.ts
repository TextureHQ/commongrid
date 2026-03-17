#!/usr/bin/env npx tsx
/**
 * capture-vr.ts — Main orchestrator for visual regression capture pipeline.
 *
 * Usage:
 *   npx tsx scripts/visual-regression/capture-vr.ts [options]
 *
 * Options:
 *   --base-ref <ref>       Base git ref (default: main)
 *   --captures <id,id>     Only run specific capture IDs
 *   --viewports <vp,vp>    Only run specific viewports
 *   --skip-capture         Skip screenshot capture, re-process existing
 *   --skip-base            Skip base capture (use existing base screenshots)
 *   --skip-compose         Skip composition (just capture + annotate)
 *   --output <dir>         Output directory (default: .visual-regression)
 */

import { execSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { captureAll, type ManifestCapture, type ManifestViewport } from "./playwright-capture";
import { annotateImage, type AnnotationColor, type AnnotationRegion } from "./annotate";
import { composeComparison } from "./compose";
import { computeDiff } from "./diff";
import { scanForAlerts, type AlertRegion } from "./detect-alerts";

// ── Config ──────────────────────────────────────────────────────────────────

interface Manifest {
	version: string;
	baseRef: string;
	prRef: string;
	devServer: {
		command: string;
		readyPattern: string;
		basePort: number;
		prPort: number;
	};
	viewports: ManifestViewport[];
	captures: ManifestCapture[];
}

interface CatalogEntry {
	id: string;
	commit?: string;
	description: string;
	viewports: Record<string, {
		before: string;
		after: string;
		comparison: string;
		diffPercent: number;
		alerts?: { before: AlertRegion[]; after: AlertRegion[] };
	}>;
}

// ── Versioning ───────────────────────────────────────────────────────────────

/** Delete all versioned files matching `{stem}_NN{ext}` in a directory. */
function cleanVersionedFiles(dir: string, stem: string, ext: string): void {
	if (!fs.existsSync(dir)) return;
	const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const re = new RegExp(`^${escapedStem}_(\\d+)${ext.replace(".", "\\.")}$`);
	for (const f of fs.readdirSync(dir)) {
		if (re.test(f)) fs.unlinkSync(path.join(dir, f));
	}
}

/**
 * Find the next ordinal version for a file stem in a directory.
 * Deletes all prior versioned files so only the latest is kept.
 * Existing: foo_00.png, foo_01.png → deletes both, returns "foo_02" and 2.
 * No existing: returns "foo_00" and 0.
 */
function nextVersionedStem(dir: string, stem: string, ext: string): { filename: string; ordinal: number } {
	let ordinal = 0;
	if (fs.existsSync(dir)) {
		const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const re = new RegExp(`^${escapedStem}_(\\d+)${ext.replace(".", "\\.")}$`);
		for (const f of fs.readdirSync(dir)) {
			const match = f.match(re);
			if (match) {
				const n = parseInt(match[1], 10);
				if (n >= ordinal) ordinal = n + 1;
			}
		}
		// Remove all prior versions
		cleanVersionedFiles(dir, stem, ext);
	}
	const pad = String(ordinal).padStart(2, "0");
	return { filename: `${stem}_${pad}${ext}`, ordinal };
}

// ── Args ────────────────────────────────────────────────────────────────────

function parseArgs() {
	const args = process.argv.slice(2);
	const opts = {
		baseRef: "main",
		captures: null as string[] | null,
		viewports: null as string[] | null,
		skipCapture: false,
		skipBase: false,
		skipCompose: false,
		output: ".visual-regression",
	};

	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case "--base-ref": opts.baseRef = args[++i]; break;
			case "--captures": opts.captures = args[++i].split(","); break;
			case "--viewports": opts.viewports = args[++i].split(","); break;
			case "--skip-capture": opts.skipCapture = true; break;
			case "--skip-base": opts.skipBase = true; break;
			case "--skip-compose": opts.skipCompose = true; break;
			case "--output": opts.output = args[++i]; break;
		}
	}
	return opts;
}

// ── Server Management ───────────────────────────────────────────────────────

async function ensurePortFree(port: number): Promise<void> {
	try {
		const res = await fetch(`http://localhost:${port}`);
		throw new Error(
			`Port ${port} is already in use (got HTTP ${res.status}). ` +
			`Kill the process on that port or change devServer ports in capture-manifest.json.`,
		);
	} catch (err) {
		if (err instanceof Error && err.message.startsWith("Port ")) throw err;
		// fetch failed = port is free, good
	}
}

function startDevServer(cwd: string, port: number): ChildProcess {
	const child = spawn("npx", ["next", "dev", "-p", String(port)], {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
		env: { ...process.env, PORT: String(port), NODE_ENV: "development" },
		shell: true,
	});
	return child;
}

async function waitForServer(port: number, timeoutMs = 90_000): Promise<void> {
	const start = Date.now();
	const url = `http://localhost:${port}`;
	let lastStatus = 0;
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(url);
			lastStatus = res.status;
			if (res.ok) return; // server is up and serving content
			// 404 means server is up but route doesn't exist yet (still compiling)
			// Keep waiting for a 200
			if (res.status === 404) {
				// Check if it's a Next.js compilation wait — try the root
				const rootRes = await fetch(url);
				if (rootRes.ok) return;
			}
		} catch { /* not ready yet */ }
		await new Promise((r) => setTimeout(r, 1500));
	}
	// Accept 404 as "server is up" after timeout — some routes may genuinely not exist on base
	if (lastStatus === 404) return;
	throw new Error(`Server on port ${port} did not start within ${timeoutMs}ms`);
}

function killServer(child: ChildProcess) {
	if (child.pid) {
		try {
			process.kill(-child.pid, "SIGTERM");
		} catch {
			child.kill("SIGTERM");
		}
	}
}

// ── Worktree ────────────────────────────────────────────────────────────────

function createWorktree(baseRef: string, repoRoot: string): string {
	const worktreePath = "/tmp/cg-vr-base";
	try { execSync(`git worktree remove ${worktreePath} --force 2>/dev/null`); } catch { /* ok */ }
	execSync(`git worktree add ${worktreePath} ${baseRef}`, { stdio: "inherit" });

	// Install deps in worktree
	const lockPath = path.join(worktreePath, "package-lock.json");
	if (fs.existsSync(lockPath)) {
		console.log("📦 Installing deps in base worktree...");
		execSync("npm install --prefer-offline", { cwd: worktreePath, stdio: "inherit" });
	}

	// Copy data/ directory into worktree so pages can load
	// The data/ dir is git-tracked but public/data/ is .gitignore'd (generated by prebuild)
	const srcData = path.join(repoRoot, "data");
	const dstData = path.join(worktreePath, "data");
	if (fs.existsSync(srcData) && !fs.existsSync(path.join(dstData, "utilities.json"))) {
		console.log("📂 Syncing data/ directory to worktree...");
		execSync(`cp -r "${srcData}"/* "${dstData}/"`, { stdio: "inherit" });
	}

	// Run prebuild to copy data into public/data/ for the dev server
	console.log("🔨 Running prebuild in base worktree...");
	try {
		execSync("npm run prebuild", { cwd: worktreePath, stdio: "inherit", timeout: 30_000 });
	} catch (err) {
		console.warn("⚠ prebuild failed in worktree (non-fatal, some pages may 404)");
	}

	return worktreePath;
}

function removeWorktree() {
	try { execSync("git worktree remove /tmp/cg-vr-base --force 2>/dev/null"); } catch { /* ok */ }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
	const opts = parseArgs();
	const repoRoot = execSync("git rev-parse --show-toplevel").toString().trim();
	const manifestPath = path.join(repoRoot, "scripts/visual-regression/capture-manifest.json");
	const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

	// Apply filters
	let captures = manifest.captures;
	if (opts.captures) {
		captures = captures.filter((c) => opts.captures!.includes(c.id));
	}
	const viewports = opts.viewports
		? manifest.viewports.filter((v) => opts.viewports!.includes(v.name))
		: manifest.viewports;

	// Output dirs
	const outDir = path.resolve(repoRoot, opts.output);
	const dirs = {
		before: path.join(outDir, "captures/before"),
		after: path.join(outDir, "captures/after"),
		annotated: path.join(outDir, "captures/annotated"),
		comparisons: path.join(outDir, "captures/comparisons"),
		diffs: path.join(outDir, "captures/diffs"),
	};
	for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });

	console.log(`\n🔍 Visual Regression Capture`);
	console.log(`   Base: ${opts.baseRef}`);
	console.log(`   Captures: ${captures.length}`);
	console.log(`   Viewports: ${viewports.map((v) => v.name).join(", ")}`);
	console.log(`   Output: ${outDir}\n`);

	// ── Phase 1: Capture ──────────────────────────────────────────────────

	let baseServer: ChildProcess | null = null;
	let prServer: ChildProcess | null = null;
	let worktreePath: string | null = null;

	if (!opts.skipCapture) {
		try {
			// Run prebuild for PR server to ensure public/data/ is populated
			console.log("🔨 Running prebuild for PR branch...");
			try {
				execSync("npm run prebuild", { cwd: repoRoot, stdio: "inherit", timeout: 30_000 });
			} catch {
				console.warn("⚠ prebuild failed for PR branch (non-fatal)");
			}

			// Ensure ports are free before starting
			console.log("🔌 Checking port availability...");
			await ensurePortFree(manifest.devServer.prPort);
			if (!opts.skipBase) await ensurePortFree(manifest.devServer.basePort);

			// Start PR server (current branch)
			console.log("🚀 Starting PR dev server on port", manifest.devServer.prPort);
			prServer = startDevServer(repoRoot, manifest.devServer.prPort);

			if (!opts.skipBase) {
				// Create worktree for base (with data + prebuild)
				console.log(`🌳 Creating worktree for ${opts.baseRef}...`);
				worktreePath = createWorktree(opts.baseRef, repoRoot);

				// Start base server
				console.log("🚀 Starting base dev server on port", manifest.devServer.basePort);
				baseServer = startDevServer(worktreePath, manifest.devServer.basePort);
			}

			// Wait for servers
			console.log("⏳ Waiting for servers...");
			const waits = [waitForServer(manifest.devServer.prPort)];
			if (!opts.skipBase) waits.push(waitForServer(manifest.devServer.basePort));
			await Promise.all(waits);
			console.log("✅ Servers ready\n");

			// Capture AFTER (PR state)
			console.log("📸 Capturing AFTER screenshots...");
			await captureAll(
				`http://localhost:${manifest.devServer.prPort}`,
				captures,
				viewports,
				dirs.after,
				"after",
			);

			// Capture BEFORE (base state)
			if (!opts.skipBase) {
				console.log("\n📸 Capturing BEFORE screenshots...");
				await captureAll(
					`http://localhost:${manifest.devServer.basePort}`,
					captures,
					viewports,
					dirs.before,
					"before",
				);
			}
		} finally {
			// Cleanup servers
			if (prServer) killServer(prServer);
			if (baseServer) killServer(baseServer);
			if (worktreePath) {
				console.log("\n🧹 Cleaning up worktree...");
				removeWorktree();
			}
		}
	}

	// ── Phase 2: Annotate ─────────────────────────────────────────────────

	console.log("\n🎨 Annotating screenshots...");
	const catalog: CatalogEntry[] = [];

	for (const capture of captures) {
		const vpNames = capture.viewports ?? viewports.map((v) => v.name);
		const activeVps = viewports.filter((v) => vpNames.includes(v.name));
		const entry: CatalogEntry = {
			id: capture.id,
			commit: capture.commit,
			description: capture.description,
			viewports: {},
		};

		for (const vp of activeVps) {
			const stem = `${capture.id}-${vp.name}`;
			const beforeRaw = path.join(dirs.before, `${stem}.png`);
			const afterRaw = path.join(dirs.after, `${stem}.png`);
			const beforeRegionsPath = path.join(dirs.before, `${stem}.regions.json`);
			const afterRegionsPath = path.join(dirs.after, `${stem}.regions.json`);

			// Versioned outputs — each run overwrites prior versions, keeping only the latest
			const { filename: compFilename, ordinal } = nextVersionedStem(dirs.comparisons, stem, ".png");
			const versionSuffix = `_${String(ordinal).padStart(2, "0")}`;
			// Clean prior annotated and diff versions for this stem
			cleanVersionedFiles(dirs.annotated, `${stem}-before`, ".png");
			cleanVersionedFiles(dirs.annotated, `${stem}-after`, ".png");
			cleanVersionedFiles(dirs.diffs, `${stem}-diff`, ".png");
			const beforeAnnotated = path.join(dirs.annotated, `${stem}-before${versionSuffix}.png`);
			const afterAnnotated = path.join(dirs.annotated, `${stem}-after${versionSuffix}.png`);
			const comparisonPath = path.join(dirs.comparisons, compFilename);
			const diffPath = path.join(dirs.diffs, `${stem}-diff${versionSuffix}.png`);

			if (ordinal > 0) {
				console.log(`  🔄 ${stem}: version ${versionSuffix} (${ordinal} prior run${ordinal > 1 ? "s" : ""})`);
			}

			// Load region data
			let beforeRegions: AnnotationRegion[] = [];
			let afterRegions: AnnotationRegion[] = [];

			if (fs.existsSync(beforeRegionsPath)) {
				const raw = JSON.parse(fs.readFileSync(beforeRegionsPath, "utf-8"));
				beforeRegions = raw
					.filter((r: any) => r.bbox)
					.map((r: any) => ({
						bbox: r.bbox,
						color: r.beforeColor as AnnotationColor,
						label: r.label,
					}));
			}
			if (fs.existsSync(afterRegionsPath)) {
				const raw = JSON.parse(fs.readFileSync(afterRegionsPath, "utf-8"));
				afterRegions = raw
					.filter((r: any) => r.bbox)
					.map((r: any) => ({
						bbox: r.bbox,
						color: r.afterColor as AnnotationColor,
						label: r.label,
					}));
			}

			// Annotate
			if (fs.existsSync(beforeRaw)) {
				await annotateImage(beforeRaw, beforeRegions, beforeAnnotated);
			}
			if (fs.existsSync(afterRaw)) {
				await annotateImage(afterRaw, afterRegions, afterAnnotated);
			}

			// Diff
			let diffPercent = 0;
			if (fs.existsSync(beforeRaw) && fs.existsSync(afterRaw)) {
				const result = computeDiff(beforeRaw, afterRaw, diffPath);
				diffPercent = result.diffPercent;
				console.log(`  📊 ${stem}: ${diffPercent}% pixel diff`);
			}

			// Alert scan — detect red pill-shaped indicators in raw screenshots
			let alertsBefore: AlertRegion[] = [];
			let alertsAfter: AlertRegion[] = [];
			if (fs.existsSync(beforeRaw)) {
				const scan = scanForAlerts(beforeRaw);
				alertsBefore = scan.regions;
				if (scan.hasAlerts) {
					console.log(`  🔴 ${stem} BEFORE: ${scan.regions.length} alert region(s) detected [${scan.regions.map((r) => r.corner).join(", ")}]`);
				}
			}
			if (fs.existsSync(afterRaw)) {
				const scan = scanForAlerts(afterRaw);
				alertsAfter = scan.regions;
				if (scan.hasAlerts) {
					console.log(`  🔴 ${stem} AFTER: ${scan.regions.length} alert region(s) detected [${scan.regions.map((r) => r.corner).join(", ")}]`);
				}
			}

			// Compose
			if (!opts.skipCompose && fs.existsSync(beforeAnnotated) && fs.existsSync(afterAnnotated)) {
				const title = `${capture.description} · ${vp.name} (${vp.width}px)`;
				await composeComparison(beforeAnnotated, afterAnnotated, title, comparisonPath);
				// Also write/overwrite the unversioned "latest" copy for easy reference
				const latestPath = path.join(dirs.comparisons, `${stem}.png`);
				if (latestPath !== comparisonPath) {
					fs.copyFileSync(comparisonPath, latestPath);
				}
				console.log(`  ✓ ${stem} composed → ${path.basename(comparisonPath)}`);
			}

			entry.viewports[vp.name] = {
				before: path.relative(outDir, beforeAnnotated),
				after: path.relative(outDir, afterAnnotated),
				comparison: path.relative(outDir, comparisonPath),
				diffPercent,
				alerts: (alertsBefore.length > 0 || alertsAfter.length > 0)
					? { before: alertsBefore, after: alertsAfter }
					: undefined,
			};
		}

		catalog.push(entry);
	}

	// ── Phase 3: Output ───────────────────────────────────────────────────

	// Write catalog
	const catalogPath = path.join(outDir, "catalog.json");
	fs.writeFileSync(catalogPath, JSON.stringify({
		generatedAt: new Date().toISOString(),
		baseRef: opts.baseRef,
		prRef: manifest.prRef,
		comparisons: catalog,
	}, null, 2));

	// Generate markdown table
	const mdLines = [
		"## Visual Regression Report\n",
		`Generated: ${new Date().toISOString()}  `,
		`Base: \`${opts.baseRef}\` · PR: \`${manifest.prRef}\`\n`,
		"| Change | Viewport | Diff % | Comparison |",
		"|--------|----------|--------|------------|",
	];

	for (const entry of catalog) {
		for (const [vpName, data] of Object.entries(entry.viewports)) {
			const compPath = data.comparison;
			mdLines.push(
				`| ${entry.description} | ${vpName} | ${data.diffPercent}% | [View](${compPath}) |`,
			);
		}
	}

	mdLines.push(
		"",
		"<details>",
		"<summary>Diff summary</summary>",
		"",
		"| Capture | Viewport | Pixel diff % |",
		"|---------|----------|-------------|",
	);
	for (const entry of catalog) {
		for (const [vpName, data] of Object.entries(entry.viewports)) {
			mdLines.push(`| ${entry.id} | ${vpName} | ${data.diffPercent}% |`);
		}
	}
	mdLines.push("", "</details>");

	// Alert summary in report
	const allAlerts = catalog.flatMap((c) =>
		Object.entries(c.viewports)
			.filter(([, d]) => d.alerts)
			.map(([vpName, d]) => ({ id: c.id, vpName, alerts: d.alerts! })),
	);

	if (allAlerts.length > 0) {
		mdLines.push(
			"",
			"---",
			"",
			"### ⚠️ Alert Indicators Detected",
			"",
			"The following captures contain red pill/badge-shaped elements that may indicate runtime errors or notifications:",
			"",
			"| Capture | Viewport | State | Regions | Location(s) |",
			"|---------|----------|-------|---------|-------------|",
		);
		for (const { id, vpName, alerts } of allAlerts) {
			if (alerts.before.length > 0) {
				mdLines.push(`| ${id} | ${vpName} | BEFORE | ${alerts.before.length} | ${alerts.before.map((r) => r.corner).join(", ")} |`);
			}
			if (alerts.after.length > 0) {
				mdLines.push(`| ${id} | ${vpName} | AFTER | ${alerts.after.length} | ${alerts.after.map((r) => r.corner).join(", ")} |`);
			}
		}
	}

	const mdPath = path.join(outDir, "pr-screenshots.md");
	fs.writeFileSync(mdPath, mdLines.join("\n"));

	console.log(`\n✅ Done!`);
	console.log(`   Catalog: ${catalogPath}`);
	console.log(`   Report:  ${mdPath}`);
	console.log(`   Images:  ${dirs.comparisons}/`);

	// Summary
	const totalDiffs = catalog.flatMap((c) => Object.values(c.viewports));
	const changed = totalDiffs.filter((d) => d.diffPercent > 0);
	console.log(`\n   ${totalDiffs.length} captures, ${changed.length} with visual changes`);

	if (allAlerts.length > 0) {
		console.log(`\n   🔴 ${allAlerts.length} capture(s) have alert indicators — inspect these screenshots!`);
	}
}

main().catch((err) => {
	console.error("❌ Fatal:", err);
	removeWorktree();
	process.exit(1);
});
