import { homepageMetadata } from "@/lib/seo";
import HomePageClient from "./HomePageClient";

// Homepage-only canonical: placing it on a shared layout would incorrectly
// canonicalize entity details and every other child route to the homepage.
export const metadata = homepageMetadata;

export default function HomePage() {
  return <HomePageClient />;
}
