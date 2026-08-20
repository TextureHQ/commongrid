export interface HomepageCard {
  id: string;
  href: string;
  name: string;
  desc: string;
  tags: string[];
}

export const HOMEPAGE_ENTITY_CARDS: HomepageCard[] = [
  {
    id: "utilities",
    href: "/explore?tab=utilities",
    name: "Electric utilities",
    desc: "All U.S. utilities — IOUs, co-ops, munis, and federal power agencies. Filtered by state, segment, and ISO.",
    tags: ["EIA-861", "FERC"],
  },
  {
    id: "grid-operators",
    href: "/grid-operators",
    name: "ISOs, RTOs & balancing authorities",
    desc: "The entities that coordinate dispatch, markets, and reliability across every interconnection.",
    tags: ["NERC", "FERC-714"],
  },
  {
    id: "programs",
    href: "/explore?view=programs",
    name: "Programs & incentives",
    desc: "Demand response, rebates, EV programs, VPP — queryable by asset type, segment, and territory.",
    tags: ["Structured", "Citable"],
  },
  {
    id: "rates",
    href: "/rates",
    name: "Rates & tariffs",
    desc: "Residential and commercial rate structures — TOU windows, demand charges, standby, net metering.",
    tags: ["OpenEI", "Filed"],
  },
  {
    id: "power-plants",
    href: "/power-plants",
    name: "Power plants",
    desc: "Solar, wind, nuclear, gas, hydro — EIA Form 860 normalized and connected to utilities and territories.",
    tags: ["EIA-860", ">1 MW"],
  },
  {
    id: "transmission-lines",
    href: "/transmission-lines",
    name: "Transmission lines",
    desc: "High-voltage infrastructure from 69 kV to 765 kV. Spatially queryable, attributed to owners.",
    tags: ["HIFLD", "Spatial"],
  },
  {
    id: "ev-charging",
    href: "/ev-charging",
    name: "EV charging stations",
    desc: "Every public AC and DC station in the U.S. — networks, plug standards, and power levels.",
    tags: ["AFDC", "OCPI"],
  },
  {
    id: "pricing-nodes",
    href: "/pricing-nodes",
    name: "Pricing nodes",
    desc: "Wholesale market nodes — trading hubs, load zones, SUBLAPs, and generation pricing across 7 ISOs/RTOs.",
    tags: ["LMP", "DA / RT"],
  },
  {
    id: "substations",
    href: "/substations",
    name: "Substations",
    desc: "Step-up, step-down, and switching substations — voltage class, owner, and interconnected assets normalized from OpenStreetMap.",
    tags: ["OSM", "≥69 kV"],
  },
];
