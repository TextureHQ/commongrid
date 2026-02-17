export default function Page() {
  return (
    <main>
      <section className="hero">
        <div className="tag">Texture Open Source</div>
        <h1>OpenGrid</h1>
        <p>
          OpenGrid is an open-source initiative to expose Texture’s Context layer
          (Layer 1) as a community‑maintained energy knowledge base. We’ll seed
          it with public datasets, then open it for contributions.
        </p>
        <div className="cta">
          <a href="https://github.com/TextureHQ/opengrid" target="_blank" rel="noreferrer">
            View on GitHub
          </a>
          <a className="secondary" href="mailto:opensource@texturehq.com">
            Contact
          </a>
        </div>
      </section>

      <h2>Summary</h2>
      <p>
        OpenGrid is a public, structured map of the energy world—utility
        territories, rate structures, grid operators, manufacturers, regulatory
        policies, and more. Texture will publish the initial dataset from public
        sources (EIA, NOAA, HIFLD, state PUC filings) and then open it for the
        community to browse, consume, and improve.
      </p>

      <h2>Why this makes sense</h2>
      <ul>
        <li>
          The data is public; the value is in cleaning, normalization, and a
          shared schema.
        </li>
        <li>
          Community contributions solve the cold‑start problem and extend
          coverage across the long tail of cooperatives and municipal utilities.
        </li>
        <li>
          Texture’s defensibility lives above Layer 1—identity, telemetry,
          reasoning, control—not in the raw entities.
        </li>
      </ul>

      <h2>Contribution model</h2>
      <p>
        We follow an OpenStreetMap‑style model: edits publish immediately after
        schema validation. Quality is enforced with automated checks, changeset
        history, anomaly detection, and fast revert tools.
      </p>
      <ul>
        <li>Browse &amp; flag (no account required)</li>
        <li>Edit (authenticated, schema‑validated)</li>
        <li>Claim &amp; verify (organization‑level stewardship)</li>
      </ul>

      <h2>Phased approach</h2>
      <ul>
        <li>
          <strong>Phase 1:</strong> Read‑only launch with 3–5 entity types and
          a public explorer/API.
        </li>
        <li>
          <strong>Phase 2:</strong> Open editing with changesets, automated
          confidence checks, and review tooling.
        </li>
        <li>
          <strong>Phase 3:</strong> Community ecosystem with verified orgs and
          contributor reputation.
        </li>
      </ul>

      <h2>Design decisions to resolve</h2>
      <ul>
        <li>Licensing model (CC‑BY vs ODbL vs CLA‑gated contributions)</li>
        <li>Scope of relational exposure (entities vs cross‑domain joins)</li>
        <li>Provenance &amp; confidence scoring per attribute</li>
        <li>Brand identity alignment with Texture</li>
      </ul>

      <div className="footer">© {new Date().getFullYear()} Texture</div>
    </main>
  );
}
