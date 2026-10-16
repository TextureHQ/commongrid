import Link from "next/link";

export function LegalNoticeBar() {
  return (
    <aside className="cg-legal-notice" aria-label="Data use notice">
      <span>Public-source data. Not for operational, safety, or reliability decisions.</span>
      <span className="cg-legal-notice-links">
        <Link href="/terms">Terms</Link>
        <Link href="/acceptable-use">Acceptable Use</Link>
        <Link href="/privacy">Privacy</Link>
      </span>
    </aside>
  );
}
