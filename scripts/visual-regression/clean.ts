#!/usr/bin/env npx tsx
/**
 * clean.ts — Safely clear VR output while preserving a reconstruction receipt.
 *
 * Before deleting captures, writes a one-line entry to .visual-regression/run-log.jsonl
 * with the metadata needed to reproduce the run. The run-log is append-only and
 * survives cleans — it's the local ledger. The PR itself (GitHub) is the source
 * of truth for the actual images and attestations.
 *
 * Usage:
 *   npx tsx scripts/visual-regression/clean.ts          # archive + delete captures
 *   npx tsx scripts/visual-regression/clean.ts --all     # also delete the run-log
 *   npx tsx scripts/visual-regression/clean.ts --dry-run # show what would be deleted
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

interface RunLogEntry {
	clearedAt: string;
	status: "complete" | "incomplete";
	generatedAt: string;
	branch: string;
	headSha: string;
	baseRef: string;
	captures: Array<{
		id: string;
		commit?: string;
		viewports: Record<string, { diffPercent: number }>;
	}>;
	partialArtifacts?: string[];
	reconstruct: string;
}

function main() {
	const args = process.argv.slice(2);
	const dryRun = args.includes("--dry-run");
	const deleteAll = args.includes("--all");

	const repoRoot = execSync("git rev-parse --show-toplevel").toString().trim();
	const outDir = path.join(repoRoot, ".visual-regression");
	const catalogPath = path.join(outDir, "catalog.json");
	const logPath = path.join(outDir, "run-log.jsonl");

	if (!fs.existsSync(outDir)) {
		console.log("Nothing to clean — .visual-regression/ does not exist.");
		return;
	}

	// ── Archive to run-log ───────────────────────────────────────────────

	const capturesDir = path.join(outDir, "captures");
	const hasCatalog = fs.existsSync(catalogPath);
	const hasCaptures = fs.existsSync(capturesDir);

	if ((hasCatalog || hasCaptures) && !deleteAll) {
		let branch = "unknown";
		let headSha = "unknown";
		try {
			branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
			headSha = execSync("git rev-parse --short HEAD").toString().trim();
		} catch { /* ok */ }

		let entry: RunLogEntry;

		if (hasCatalog) {
			// Complete run — catalog exists with full results
			const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
			entry = {
				clearedAt: new Date().toISOString(),
				status: "complete",
				generatedAt: catalog.generatedAt ?? "unknown",
				branch,
				headSha,
				baseRef: catalog.baseRef ?? "main",
				captures: (catalog.comparisons ?? []).map((c: any) => ({
					id: c.id,
					commit: c.commit,
					viewports: Object.fromEntries(
						Object.entries(c.viewports ?? {}).map(([vp, data]: [string, any]) => [
							vp,
							{ diffPercent: data.diffPercent },
						]),
					),
				})),
				reconstruct: `npm run vr:capture -- --base-ref ${catalog.baseRef ?? "main"}`,
			};
		} else {
			// Incomplete run — captures exist but pipeline didn't finish
			const partialArtifacts: string[] = [];
			if (hasCaptures) {
				for (const sub of ["before", "after", "annotated", "comparisons", "diffs"]) {
					const subDir = path.join(capturesDir, sub);
					if (fs.existsSync(subDir)) {
						const count = fs.readdirSync(subDir).filter((f) => f.endsWith(".png")).length;
						if (count > 0) partialArtifacts.push(`${sub}: ${count} files`);
					}
				}
			}
			entry = {
				clearedAt: new Date().toISOString(),
				status: "incomplete",
				generatedAt: "unknown",
				branch,
				headSha,
				baseRef: "main",
				captures: [],
				partialArtifacts,
				reconstruct: "npm run vr:capture -- --base-ref main",
			};
		}

		if (dryRun) {
			console.log("Would append to run-log.jsonl:");
			console.log(JSON.stringify(entry, null, 2));
		} else {
			fs.mkdirSync(outDir, { recursive: true });
			fs.appendFileSync(logPath, JSON.stringify(entry) + "\n");
			const statusLabel = entry.status === "complete" ? "📋" : "⚠️";
			console.log(`${statusLabel} Archived ${entry.status} run metadata to run-log.jsonl`);
			console.log(`   Branch: ${entry.branch} (${entry.headSha})`);
			if (entry.status === "complete") {
				console.log(`   Generated: ${entry.generatedAt}`);
				console.log(`   Captures: ${entry.captures.length}`);
			} else {
				console.log(`   Status: incomplete (pipeline did not finish)`);
				if (entry.partialArtifacts?.length) {
					console.log(`   Partial: ${entry.partialArtifacts.join(", ")}`);
				}
			}
		}
	}

	// ── Delete output ────────────────────────────────────────────────────

	const toDelete: string[] = [];

	// Always delete captures/, catalog.json, pr-screenshots.md
	if (fs.existsSync(capturesDir)) toDelete.push(capturesDir);
	if (fs.existsSync(catalogPath)) toDelete.push(catalogPath);
	const mdPath = path.join(outDir, "pr-screenshots.md");
	if (fs.existsSync(mdPath)) toDelete.push(mdPath);

	if (deleteAll && fs.existsSync(logPath)) {
		toDelete.push(logPath);
	}

	if (toDelete.length === 0) {
		console.log("Nothing to delete.");
		return;
	}

	if (dryRun) {
		console.log("\nWould delete:");
		for (const p of toDelete) console.log(`  ${path.relative(repoRoot, p)}`);
		return;
	}

	for (const p of toDelete) {
		fs.rmSync(p, { recursive: true, force: true });
	}

	// Calculate what was freed
	console.log(`\n🧹 Cleaned:`);
	for (const p of toDelete) {
		console.log(`   ✓ ${path.relative(repoRoot, p)}`);
	}

	// Show what remains
	if (fs.existsSync(outDir)) {
		const remaining = fs.readdirSync(outDir);
		if (remaining.length > 0) {
			console.log(`\n   Preserved: ${remaining.join(", ")}`);
		}
	}

	console.log(`\n   Reconstruct with: npm run vr:capture`);
}

main();
