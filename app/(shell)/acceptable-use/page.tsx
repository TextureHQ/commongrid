import type { Metadata } from "next";
import Link from "next/link";
import { POLICY_EFFECTIVE_DATE } from "@/lib/legal/policies";
import "../legal.css";

export const metadata: Metadata = { title: "Acceptable Use Policy" };

export default function AcceptableUsePage() {
  return (
    <div className="cg-legal-page">
      <article className="cg-legal-inner">
        <h1>Acceptable Use Policy</h1>
        <p className="cg-legal-effective">Effective {POLICY_EFFECTIVE_DATE}</p>
        <p>
          This policy governs conduct when using the CommonGrid-hosted website, map, API, downloads, contribution tools,
          and related services. It does not restrict rights in database copies made available under the ODbL.
        </p>

        <h2>Use the Services lawfully and responsibly</h2>
        <p>You may not use the Services to:</p>
        <ul>
          <li>violate applicable law, regulation, sanctions, export controls, or another person’s rights;</li>
          <li>
            identify, select, surveil, or facilitate the malicious targeting of energy facilities, personnel, systems,
            or communities;
          </li>
          <li>
            plan, enable, encourage, or carry out physical or cyber intrusion, sabotage, disruption, interference,
            damage, or unauthorized access involving critical infrastructure;
          </li>
          <li>threaten, harass, deceive, impersonate, or expose another person’s sensitive personal information;</li>
          <li>upload malicious code or attempt to bypass access controls, security measures, or usage limits;</li>
          <li>overload, degrade, or interfere with the hosted Services or other users’ access;</li>
          <li>submit information you know is materially false, unlawfully obtained, or not yours to share; or</li>
          <li>use CommonGrid as an authoritative operational, safety, emergency, security, or reliability system.</li>
        </ul>

        <h2>Automated access</h2>
        <p>
          Use documented APIs and downloads where available. Respect published technical limits and reasonable requests
          intended to protect service availability. Hosted-service rate limits do not limit your right to use an
          ODbL-licensed copy of the database obtained through a download or other lawful channel.
        </p>

        <h2>Enforcement and reporting</h2>
        <p>
          We may investigate suspected violations and suspend or terminate access to hosted Services. We may preserve
          and disclose information when reasonably necessary to comply with law or address credible threats. To report
          abuse or a security concern, email <a href="mailto:security@texturehq.com">security@texturehq.com</a>. For
          other questions, see the <Link href="/terms">Terms of Use</Link>.
        </p>
      </article>
    </div>
  );
}
