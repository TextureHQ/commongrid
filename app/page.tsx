export default function Page() {
  return (
    <main>
      <section className="hero">
        <div className="tag">Texture Open Source</div>
        <h1>OpenGrid</h1>
        <p>
          OpenGrid is an open-source initiative to make grid intelligence more
          accessible. We’re building shared infrastructure for grid data,
          reliability insights, and transparent energy analytics.
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

      <h2>Why OpenGrid</h2>
      <p>
        The energy transition needs shared tooling and open data. OpenGrid will
        provide a neutral home for datasets, dashboards, and integration patterns
        that help developers, operators, and researchers build smarter grid
        software.
      </p>

      <h2>What’s coming</h2>
      <ul>
        <li>Public roadmap and contribution guidelines</li>
        <li>OpenGrid data catalog and documentation</li>
        <li>Reference integrations for common grid workflows</li>
      </ul>

      <h2>How to get involved</h2>
      <p>
        We’re documenting the vision now. If you want to collaborate or share
        datasets, reach out and we’ll loop you in.
      </p>

      <div className="footer">© {new Date().getFullYear()} Texture</div>
    </main>
  );
}
