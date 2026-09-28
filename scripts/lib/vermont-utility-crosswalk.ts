/**
 * Exact PSD COMPANYNAM -> existing EIA-861 utility IDs.
 * PSD layer: https://maps.vcgi.vermont.gov/arcgis/rest/services/PSD_services/PSD_Published_Layers/MapServer/0
 * Cross-checked against the VT records in data/utilities.json. Original EIA
 * filing revalidation is a release gate; see docs/data-sources/vermont-territories.md.
 * Never treat OBJECTID or Customer_Num as an EIA utility ID.
 */
export const VERMONT_UTILITY_EIA_IDS: Readonly<Record<string, string>> = {
  "Burlington Electric Dept.": "2548",
  "Green Mountain Power": "7601",
  "Ludlow Electric Light Dept.": "11305",
  "Swanton Village Electric Dept.": "18371",
  "Vermont Electric Co-op": "19791",
  "Village of Barton": "1299",
  "Village of Enosburg Falls": "5915",
  "Village of Hardwick": "8104",
  "Village of Hyde Park": "9144",
  "Village of Jacksonville Electric Dept.": "9610",
  "Village of Johnson": "9806",
  "Village of Lyndonville Electric Dept.": "11359",
  "Village of Morrisville Water & Light Dept.": "12989",
  "Village of Northfield": "13789",
  "Village of Orleans": "14261",
  "Village of Stowe Electric Dept.": "27316",
  "Washington Electric Co-op": "20151",
};
