import type { Metadata } from "next";

export const PAGE_TITLES = {
  explore: "Explore the Grid",
  gridOperators: "Grid Operators",
  balancingAuthorities: "Balancing Authorities",
  powerPlants: "Power Plants",
  transmissionLines: "Transmission Lines",
  substations: "US Electric Substations",
  evCharging: "EV Charging Stations",
  pricingNodes: "Pricing Nodes",
  api: "API Reference",
  developers: "Developers",
  contributions: "Contributions",
  changelog: "Changelog",
  snapshots: "Data Snapshots",
  about: "About",
  components: "Components",
  programs: "Utility Programs",
  moderation: "Moderation",
  moderationUsers: "Moderation - Users",
  moderationQueue: "Moderation - Review Queue",
  moderationContributions: "Reviewing Contribution", // This will be dynamic
  signIn: "Sign In",
  signUp: "Sign Up",
  addEntity: "Add a", // This will be dynamic
  // Detail page fallbacks
  utilityDetail: "Grid Operator Details",
  balancingAuthorityDetail: "Balancing Authority Details",
  powerPlantDetail: "Power Plant Details",
  evStationDetail: "EV Charging Station Details",
  pricingNodeDetail: "Pricing Node Details",
  substationDetail: "Substation Details",
  transmissionLineDetail: "Transmission Line Details",
} as const;

export type PageSection = (typeof PAGE_TITLES)[keyof typeof PAGE_TITLES];

export function buildTitle(title: string, section?: PageSection | string): string {
  if (section) {
    return `${title} - ${section}`;
  }
  return title;
}

export function buildMetadata(options: {
  title: string;
  section?: PageSection | string;
  description?: string;
}): Metadata {
  const title = buildTitle(options.title, options.section);
  return {
    title,
    description: options.description,
    openGraph: {
      title,
      description: options.description,
    },
  };
}
