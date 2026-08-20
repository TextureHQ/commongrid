import { describe, expect, it } from "vitest";
import { HOMEPAGE_ENTITY_CARDS } from "@/lib/homepage-links";

describe("homepage entity links", () => {
  it("sends the utilities tile to the utilities explorer tab", () => {
    expect(HOMEPAGE_ENTITY_CARDS.find((card) => card.id === "utilities")?.href).toBe("/explore?tab=utilities");
  });

  it("makes rates a deliberate standalone destination", () => {
    expect(HOMEPAGE_ENTITY_CARDS.find((card) => card.id === "rates")?.href).toBe("/rates");
  });
});
