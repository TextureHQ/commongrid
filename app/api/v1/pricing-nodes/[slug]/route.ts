import { NextRequest, NextResponse } from "next/server";
import { loadPricingNodeBySlug } from "@/lib/data/pricing-nodes";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const node = await loadPricingNodeBySlug(slug);

    if (!node) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: `Pricing node '${slug}' not found` } },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { data: node },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching pricing node:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
      { status: 500 }
    );
  }
}
