export default function Home() {
  return (
    <main className="container">
      <h1>⚡ Open Grid</h1>
      <p className="tagline">
        The open-source energy infrastructure dataset — built by{' '}
        <a href="https://texturehq.com" className="inline-link">Texture</a>,
        maintained by the community.
      </p>

      <div className="hero-description">
        <p>
          If you work in energy, you know the pain: utility service territories
          buried in PDFs, rate structures scattered across state PUC filings,
          grid operator boundaries that nobody agrees on, manufacturer specs
          locked behind vendor portals.
        </p>
        <p>
          We spent years pulling this data together from EIA, NOAA, HIFLD, FERC,
          state regulators, and hundreds of other public sources — cleaning it,
          normalizing it, and structuring it into something actually usable.
        </p>
        <p>
          Then we thought: <strong>why should everyone else have to do the same thing?</strong>
        </p>
      </div>

      <div className="cta-section">
        <h2>Open Grid is that dataset, open-sourced.</h2>
        <p>
          Browse it. Build on it. Contribute back. No licensing fees, no vendor
          lock-in — just clean, structured energy infrastructure data maintained
          by the people who use it.
        </p>
      </div>

      <div className="features">
        <div className="feature">
          <h3>🗺️ Utility Territories</h3>
          <p>
            Service territory boundaries for IOUs, co-ops, and munis — mapped,
            normalized, and kept current. Stop screen-scraping EIA-861.
          </p>
        </div>
        <div className="feature">
          <h3>⚡ Grid Infrastructure</h3>
          <p>
            ISO/RTO regions, balancing authorities, substations, and generation
            assets. The structural data that underpins every energy application.
          </p>
        </div>
        <div className="feature">
          <h3>📋 Rate Structures</h3>
          <p>
            Tariff data, rate schedules, and program details pulled from state
            filings and utility publications. Structured and queryable.
          </p>
        </div>
        <div className="feature">
          <h3>🔌 Device Ecosystems</h3>
          <p>
            Manufacturer specs, device catalogs, and integration profiles for
            batteries, inverters, thermostats, and EV chargers.
          </p>
        </div>
      </div>

      <div className="why-section">
        <h2>Why Open Source?</h2>
        <div className="why-grid">
          <div className="why-item">
            <h3>The data is already public</h3>
            <p>
              We're not exposing anything proprietary. This is publicly available
              information from government agencies and regulatory filings — we just
              did the unglamorous work of cleaning and structuring it.
            </p>
          </div>
          <div className="why-item">
            <h3>Nobody should have to do this twice</h3>
            <p>
              Every energy company wastes months assembling the same baseline data.
              Open Grid eliminates that duplicated effort so teams can focus on
              what actually differentiates their product.
            </p>
          </div>
          <div className="why-item">
            <h3>Community makes it better</h3>
            <p>
              Utilities know their own territories best. Manufacturers know their
              own specs. When the people closest to the data can update it directly,
              accuracy and coverage improve faster than any single company can manage.
            </p>
          </div>
          <div className="why-item">
            <h3>The energy transition needs shared infrastructure</h3>
            <p>
              The grid is getting more complex every year. DERs, storage, EVs,
              flexible loads — building the software to manage all of it starts with
              a shared understanding of the infrastructure itself.
            </p>
          </div>
        </div>
      </div>

      <div className="how-section">
        <h2>How It Works</h2>
        <p>
          Open Grid follows the <strong>OpenStreetMap model</strong>: anyone can
          browse the data, registered contributors can edit directly, and
          organizations can claim and verify their own entries. Edits publish
          immediately with full version history and automated quality checks
          against authoritative sources.
        </p>
        <div className="contribution-tiers">
          <div className="tier">
            <h3>🔍 Browse &amp; Flag</h3>
            <p>No account needed. Explore the data and flag anything that looks wrong.</p>
          </div>
          <div className="tier">
            <h3>✏️ Edit</h3>
            <p>Registered contributors edit entities directly. Schema-validated, auto-published.</p>
          </div>
          <div className="tier">
            <h3>✅ Claim &amp; Verify</h3>
            <p>Organizations claim their own data. Verified badge, ownership notifications.</p>
          </div>
        </div>
      </div>

      <div className="status">
        <h2>🚧 Early Access — Coming Soon</h2>
        <p>
          We're seeding the initial dataset and building the explorer interface.
          Star the repo, join the conversation, and be among the first to contribute.
        </p>
      </div>

      <div className="links">
        <a href="https://github.com/TextureHQ/opengrid" className="primary-link">
          ⭐ Star on GitHub
        </a>
        <a href="https://texturehq.com">About Texture</a>
      </div>

      <footer className="footer">
        <p>
          Built with ❤️ by <a href="https://texturehq.com" className="inline-link">Texture</a> —
          the energy operating system.
        </p>
      </footer>
    </main>
  )
}
