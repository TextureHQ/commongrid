import Link from "next/link";
import { DatasetSuggestionForm } from "./DatasetSuggestionForm";

export default function ContributeDatasetPage() {
  return (
    <div className="font-sans antialiased text-text-body bg-background-body">
      <section className="py-[clamp(48px,7vw,88px)]">
        <div className="max-w-[880px] mx-auto px-[clamp(20px,4vw,56px)]">
          {/* ── Intro ── */}
          <span className="font-[family-name:var(--font-fira-code)] text-xs text-rose-base font-medium tracking-[0.04em] uppercase">
            Contribute a dataset
          </span>
          <h1 className="font-[family-name:var(--font-rethink-sans)] text-[length:var(--text-display-md-size)] font-[var(--text-display-md-weight)] leading-[var(--text-display-md-line-height)] tracking-[var(--text-display-md-letter-spacing)] text-text-heading max-w-[20ch] mt-4 mb-6 [text-wrap:balance]">
            The registry grows when you add to it.
          </h1>
          <div className="text-[length:var(--text-body-lg-size)] leading-[var(--text-body-lg-line-height)] text-text-muted max-w-[62ch] space-y-4 [text-wrap:pretty]">
            <p>
              CommonGrid started with utilities, territories, operators, plants, and the other data types you can browse
              today, but it was always meant to grow. The point of a connected registry is that a new dataset makes
              everything already in it more useful: a new layer links to the utilities, territories, and assets that are
              already here.
            </p>
            <p>
              If there&rsquo;s a dataset about U.S. energy infrastructure you wish lived here, tell us about it. We
              can&rsquo;t promise every suggestion becomes a layer, but every one gets read by a moderator, and the ones
              that fit the graph and have a workable source are how the registry expands.
            </p>
          </div>

          {/* ── Form ── */}
          <div className="mt-10 pt-10 border-t border-border-default">
            <h2 className="font-[family-name:var(--font-rethink-sans)] text-[length:var(--text-heading-lg-size)] font-[var(--text-heading-lg-weight)] leading-[var(--text-heading-lg-line-height)] tracking-[var(--text-heading-lg-letter-spacing)] text-text-heading m-0 mb-2">
              Tell us about the dataset
            </h2>
            <p className="text-[length:var(--text-body-md-size)] text-text-muted m-0 mb-8 max-w-[58ch]">
              A few details are enough to start a conversation. A moderator will follow up about sourcing, licensing,
              and how it could connect to the rest of the graph.
            </p>
            <DatasetSuggestionForm />
          </div>

          {/* ── Footer note ── */}
          <p className="mt-10 pt-8 border-t border-border-default text-sm text-text-muted">
            Just want to fix or add a field on something already in the registry? You can{" "}
            <Link href="/explore" className="text-brand-primary no-underline hover:underline">
              suggest an edit
            </Link>{" "}
            on any entity page, or read more about how contribution works in the{" "}
            <Link href="/about" className="text-brand-primary no-underline hover:underline">
              about &amp; governance
            </Link>{" "}
            overview.
          </p>
        </div>
      </section>
    </div>
  );
}
