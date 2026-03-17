/**
 * compose.ts — Combine annotated BEFORE and AFTER images into a single
 * side-by-side comparison image with title bar and footer.
 *
 * Layout:
 * ┌──────────────────────────────────────────┐
 * │  TITLE BAR (description · viewport)      │
 * ├───────────────────┬──────────────────────┤
 * │                   │                      │
 * │     BEFORE        │      AFTER           │
 * │                   │                      │
 * ├───────────────────┴──────────────────────┤
 * │  FOOTER: BEFORE (main) │ AFTER (PR)      │
 * └──────────────────────────────────────────┘
 */

import sharp from "sharp";

const TITLE_H = 48;
const FOOTER_H = 28;
const DIVIDER_W = 2;
const BG_COLOR = { r: 255, g: 255, b: 255, alpha: 1 };
const TITLE_BG = "#f8f9fb";
const FOOTER_BG = "#f1f5f9";
const DIVIDER_COLOR = { r: 203, g: 213, b: 225, alpha: 1 };

function escapeXml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export async function composeComparison(
	beforePath: string,
	afterPath: string,
	title: string,
	outputPath: string,
	options: { baseLabel?: string; prLabel?: string } = {},
): Promise<void> {
	const baseLabel = options.baseLabel ?? "BEFORE (main)";
	const prLabel = options.prLabel ?? "AFTER (PR)";

	const [bBuf, aBuf] = await Promise.all([
		sharp(beforePath).toBuffer({ resolveWithObject: true }),
		sharp(afterPath).toBuffer({ resolveWithObject: true }),
	]);

	const bW = bBuf.info.width;
	const bH = bBuf.info.height;
	const aW = aBuf.info.width;
	const aH = aBuf.info.height;
	const maxH = Math.max(bH, aH);

	const totalW = bW + aW + DIVIDER_W;
	const totalH = maxH + TITLE_H + FOOTER_H;

	const titleSvg = Buffer.from(`
<svg width="${totalW}" height="${TITLE_H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${TITLE_BG}"/>
  <line x1="0" y1="${TITLE_H - 1}" x2="${totalW}" y2="${TITLE_H - 1}" stroke="#e2e8f0" stroke-width="1"/>
  <text x="${totalW / 2}" y="30" text-anchor="middle" font-size="13" font-weight="600" fill="#1f2937" font-family="system-ui,-apple-system,sans-serif">${escapeXml(title)}</text>
</svg>`);

	const footerSvg = Buffer.from(`
<svg width="${totalW}" height="${FOOTER_H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${FOOTER_BG}"/>
  <line x1="0" y1="0" x2="${totalW}" y2="0" stroke="#e2e8f0" stroke-width="1"/>
  <text x="${bW / 2}" y="18" text-anchor="middle" font-size="11" fill="#64748b" font-family="system-ui,-apple-system,sans-serif">${escapeXml(baseLabel)}</text>
  <line x1="${bW + 1}" y1="4" x2="${bW + 1}" y2="24" stroke="#cbd5e1" stroke-width="1"/>
  <text x="${bW + DIVIDER_W + aW / 2}" y="18" text-anchor="middle" font-size="11" fill="#64748b" font-family="system-ui,-apple-system,sans-serif">${escapeXml(prLabel)}</text>
</svg>`);

	const dividerBuf = await sharp({
		create: {
			width: DIVIDER_W,
			height: maxH,
			channels: 4,
			background: DIVIDER_COLOR,
		},
	})
		.png()
		.toBuffer();

	await sharp({
		create: {
			width: totalW,
			height: totalH,
			channels: 4,
			background: BG_COLOR,
		},
	})
		.composite([
			{ input: titleSvg, top: 0, left: 0 },
			{ input: bBuf.data, top: TITLE_H, left: 0 },
			{ input: dividerBuf, top: TITLE_H, left: bW },
			{ input: aBuf.data, top: TITLE_H, left: bW + DIVIDER_W },
			{ input: footerSvg, top: TITLE_H + maxH, left: 0 },
		])
		.png()
		.toFile(outputPath);
}
