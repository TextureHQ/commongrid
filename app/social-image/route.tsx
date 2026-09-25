import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const dynamic = "force-static";

// Satori cannot render Edges' client components or CSS variables. These colors
// match edges-tokens' light paper, heading and border tokens. Assets are local:
// crawlers and builds never depend on Mapbox, external fonts, or the database.
export async function GET() {
  const [logo, map] = await Promise.all([
    readFile(path.join(process.cwd(), "public/logo.svg")),
    readFile(path.join(process.cwd(), "public/hero-map-preview@2x.png")),
  ]);

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#faf7f0",
        color: "#2c2a26",
        padding: 56,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: 660, zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 38, fontWeight: 700 }}>
          <img src={`data:image/svg+xml;base64,${logo.toString("base64")}`} width="48" height="48" alt="" />
          CommonGrid
        </div>
        <div style={{ display: "flex", fontSize: 64, lineHeight: 1.08, fontWeight: 700, marginTop: 64 }}>
          The open, connected registry of the U.S. power grid
        </div>
        <div style={{ display: "flex", fontSize: 25, marginTop: 40 }}>Explore the grid. Build with open data.</div>
        <div style={{ display: "flex", fontSize: 22, marginTop: "auto" }}>commongrid.info</div>
      </div>
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 780,
          top: 56,
          width: 530,
          height: 518,
          border: "1px solid #e5dfd3",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <img
          src={`data:image/png;base64,${map.toString("base64")}`}
          width="530"
          height="518"
          style={{ objectFit: "cover" }}
          alt=""
        />
      </div>
    </div>,
    { width: 1200, height: 630 }
  );
}
