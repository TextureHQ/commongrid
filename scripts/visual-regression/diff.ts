/**
 * diff.ts — Pixel-level diff detection between two screenshots.
 * Uses pixelmatch (the same engine Playwright uses internally).
 */

import fs from "node:fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

export interface DiffResult {
	diffPixels: number;
	totalPixels: number;
	diffPercent: number;
	diffImagePath: string | null;
}

/**
 * Compare two PNG images and produce a diff overlay.
 * Returns { diffPixels, diffPercent, diffImagePath }.
 */
export function computeDiff(
	beforePath: string,
	afterPath: string,
	diffPath: string | null = null,
): DiffResult {
	const img1 = PNG.sync.read(fs.readFileSync(beforePath));
	const img2 = PNG.sync.read(fs.readFileSync(afterPath));

	// Use the larger dimensions (pad smaller image conceptually)
	const width = Math.max(img1.width, img2.width);
	const height = Math.max(img1.height, img2.height);

	// Resize data buffers if images differ in size
	const data1 = padImageData(img1, width, height);
	const data2 = padImageData(img2, width, height);

	const diff = new PNG({ width, height });

	const diffPixels = pixelmatch(data1, data2, diff.data, width, height, {
		threshold: 0.1,
		includeAA: false,
	});

	const totalPixels = width * height;
	const diffPercent = Number(((diffPixels / totalPixels) * 100).toFixed(2));

	let outPath: string | null = null;
	if (diffPath) {
		fs.writeFileSync(diffPath, PNG.sync.write(diff));
		outPath = diffPath;
	}

	return { diffPixels, totalPixels, diffPercent, diffImagePath: outPath };
}

/** Pad image data to target dimensions with transparent pixels. */
function padImageData(
	img: PNG,
	targetW: number,
	targetH: number,
): Uint8Array {
	if (img.width === targetW && img.height === targetH) {
		return new Uint8Array(img.data.buffer);
	}

	const buf = new Uint8Array(targetW * targetH * 4);
	for (let y = 0; y < img.height; y++) {
		const srcOffset = y * img.width * 4;
		const dstOffset = y * targetW * 4;
		buf.set(img.data.slice(srcOffset, srcOffset + img.width * 4), dstOffset);
	}
	return buf;
}
