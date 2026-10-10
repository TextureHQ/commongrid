import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { editableFieldDefinitions } from "@/lib/community-editable-fields/definitions";
import { GridService, GridServiceLabel } from "@/types/programs";
import { EntityFormFields } from "../EntityFormFields";

const field = editableFieldDefinitions.find(
  (item) => item.entityType === "program" && item.fieldName === "grid_services"
)!;

describe("Vehicle-to-Grid program configuration", () => {
  it("offers a distinct V2G service with a consistent human label", () => {
    expect(field.fieldType).toBe("multi_enum");
    expect(field.validationRules?.enum).toContain(GridService.VEHICLE_TO_GRID);
    expect(GridServiceLabel[GridService.VEHICLE_TO_GRID]).toBe("Vehicle-to-Grid");
    expect(GridService.VEHICLE_TO_GRID).not.toBe(GridService.DEMAND_RESPONSE);
  });

  it.each(["create", "edit"] as const)("renders V2G as a selected checkbox in %s mode", (mode) => {
    const markup = renderToStaticMarkup(
      <EntityFormFields
        fields={[field]}
        formValues={{ grid_services: [GridService.VEHICLE_TO_GRID] }}
        onChange={() => {}}
        mode={mode}
      />
    );
    expect(markup).toContain("Vehicle-to-Grid");
    expect(markup).toContain("Demand Response");
    expect(markup).toMatch(/<input[^>]*checked=""[^>]*value="VEHICLE_TO_GRID"/);
    expect(markup).not.toMatch(/<input[^>]*checked=""[^>]*value="DEMAND_RESPONSE"/);
  });
});
