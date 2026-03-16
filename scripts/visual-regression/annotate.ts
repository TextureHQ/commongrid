/**
 * annotate.ts — Draw color-coded bounding boxes and labels on screenshots.
 *
 * Uses sharp + SVG compositing (no native canvas dependency).
 *
 * Color key:
 *   red    → removed (BEFORE only)
 *   green  → added (AFTER only)
 *   blue   → modified in-place
 *   orange → recolored / remapped
 *   yellow → moved / reflowed
 */

import sharp from "sharp";

export const ANNOTATION_COLORS = {
	red: { stroke: "#EF4444", fill: "rgba(239,68,68,0.85)" },
	green: { stroke: "#22C55E", fill: "rgba(34,197,94,0.85)" },
	blue: { stroke: "#3B82F6", fill: "rgba(59,130,246,0.85)" },
	orange: { stroke: "#F97316", fill: "rgba(249,115,22,0.85)" },
	yellow: { stroke: "#EAB308", fill: "rgba(234,179,8,0.85)" },
} as const;

export type AnnotationColor = keyof typeof ANNOTATION_COLORS;

export interface BBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface AnnotationRegion {
	bbox: BBox;
	color: AnnotationColor;
	label: string;
}

function escapeXml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export async function annotateImage(
	inputPath: string,
	regions: AnnotationRegion[],
	outputPath: string,
): Promise<void> {
	const meta = await sharp(inputPath).metadata();
	const imgW = meta.width ?? 0;
	const imgH = meta.height ?? 0;

	if (regions.length === 0) {
		// No annotations — just copy
		await sharp(inputPath).toFile(outputPath);
		return;
	}

	const pad = 4;
	const strokeW = 3;
	const labelH = 20;
	const labelPadX = 8;
	const fontSize = 11;
	const charW = 6.6; // approx width per char at 11px

	const svgElements = regions
		.map((r) => {
			const c = ANNOTATION_COLORS[r.color];
			const x = Math.max(0, Math.round(r.bbox.x - pad));
			const y = Math.max(0, Math.round(r.bbox.y - pad));
			const w = Math.round(r.bbox.width + pad * 2);
			const h = Math.round(r.bbox.height + pad * 2);

			const labelText = escapeXml(r.label);
			const labelW = Math.round(labelText.length * charW + labelPadX * 2);
			const labelY = Math.max(0, y - labelH - 2);

			return [
				// Bounding box
				`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${c.stroke}" stroke-width="${strokeW}" rx="4"/>`,
				// Label background pill
				`<rect x="${x}" y="${labelY}" width="${labelW}" height="${labelH}" fill="${c.fill}" rx="3"/>`,
				// Label text
				`<text x="${x + labelPadX}" y="${labelY + 14}" font-size="${fontSize}" font-weight="bold" fill="white" font-family="system-ui,-apple-system,sans-serif">${labelText}</text>`,
			].join("\n");
		})
		.join("\n");

	const svgOverlay = Buffer.from(
		`<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">${svgElements}</svg>`,
	);

	await sharp(inputPath)
		.composite([{ input: svgOverlay, top: 0, left: 0 }])
		.toFile(outputPath);
}
