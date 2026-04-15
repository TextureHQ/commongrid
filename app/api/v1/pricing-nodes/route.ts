import { NextRequest, NextResponse } from "next/server";
import { loadPricingNodes, type PricingNodeFilters } from "@/lib/data/pricing-nodes";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const limit = Math.min(Number(sp.get("limit") || "50"), 200);

    const filters: PricingNodeFilters = {};
    if (sp.get("iso")) filters.iso = sp.get("iso")!;
    if (sp.get("nodeType")) filters.nodeType = sp.get("nodeType")!;
    if (sp.get("state")) filters.state = sp.get("state")!;
    if (sp.get("search")) filters.search = sp.get("search")!;

    const all = await loadPricingNodes(filters);
    const page = all.slice(0, limit);

    return NextResponse.json({
      data: page,
      pagination: {
        cursor: null,
        limit,
        total: all.length,
        hasMore: all.length > limit,
      },
    });
  } catch (error) {
    console.error("Error fetching pricing nodes:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
      { status: 500 }
    );
  }
}
