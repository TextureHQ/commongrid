import { getTile } from "@/lib/pmtiles-server";
import { resolveOverzoom } from "@/lib/tile-utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z, x, y: yRaw } = await params;
  const yClean = yRaw.replace(/\.pbf$|\.mvt$/, "");

  const zNum = Number.parseInt(z, 10);
  const xNum = Number.parseInt(x, 10);
  const yNum = Number.parseInt(yClean, 10);

  if (Number.isNaN(zNum) || Number.isNaN(xNum) || Number.isNaN(yNum)) {
    return new Response("Invalid tile coordinates", { status: 400 });
  }

  const resolved = resolveOverzoom(zNum, xNum, yNum);
  const data = await getTile("territories", resolved.z, resolved.x, resolved.y);

  if (!data) {
    return new Response(null, { status: 204 });
  }

  return new Response(data, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.mapbox-vector-tile",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
