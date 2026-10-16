import Link from "next/link";
import { POLICY_EFFECTIVE_DATE } from "@/lib/legal/policies";
import "../legal.css";

export default function TermsPage() {
  return (
    <div className="cg-legal-page">
      <article className="cg-legal-inner">
        <h1>Terms of Use</h1>
        <p className="cg-legal-effective">Effective {POLICY_EFFECTIVE_DATE}</p>

        <p>
          These Terms govern access to and use of the CommonGrid-hosted website, interactive map, API, downloads,
          contribution tools, and related services (the “Services”), operated by Texture Corp., a Delaware corporation
          (“Texture,” “we,” or “us”). By accessing or using the Services, you agree to these Terms and the{" "}
          <Link href="/acceptable-use">Acceptable Use Policy</Link>.
        </p>

        <h2>1. Public-source information; no operational reliance</h2>
        <p>
          CommonGrid assembles and normalizes information from government records, public datasets, community
          contributions, and other cited sources. The Services may be incomplete, delayed, inaccurate, or out of date.
          They are provided for general informational, research, and development purposes only.
        </p>
        <div className="cg-legal-callout">
          Do not use CommonGrid as the sole or authoritative basis for operational, safety, emergency-response,
          security, reliability, engineering, navigation, investment, or regulatory decisions. Verify important facts
          with the responsible utility, grid operator, regulator, or other authoritative source.
        </div>

        <h2>2. Acceptable use</h2>
        <p>
          You must use the Services lawfully and in accordance with our{" "}
          <Link href="/acceptable-use">Acceptable Use Policy</Link>. You are responsible for your use of information
          obtained through the Services and for complying with laws, sanctions, export controls, permits, and
          professional obligations that apply to you.
        </p>

        <h2>3. Accounts and contributions</h2>
        <p>
          You are responsible for activity under your account and for keeping account credentials secure. You represent
          that material you submit is accurate to the best of your knowledge, is lawfully shareable, and does not
          infringe another person’s rights. You grant Texture and CommonGrid users the rights reasonably necessary to
          host, review, display, modify, and distribute your contribution as part of the CommonGrid database under its
          applicable license.
        </p>

        <h2>4. Database license and these Terms</h2>
        <p>
          The CommonGrid database is separately made available under the Open Data Commons Open Database License 1.0
          (“ODbL”). Your rights to use, copy, modify, and redistribute the database are governed by the ODbL, not by
          these Terms. Nothing in these Terms adds a restriction to the rights granted under the ODbL. These Terms
          govern only your access to and conduct while using Texture-hosted Services, plus site software, branding, and
          content not included in the ODbL-licensed database.
        </p>
        <p>
          ODbL obligations—including attribution, share-alike requirements for adapted databases, and keeping the
          database open when technological measures are used—continue to apply. See the project’s{" "}
          <a href="https://github.com/TextureHQ/commongrid/blob/main/LICENSE">database license</a>.
        </p>

        <h2>5. Availability, changes, and termination</h2>
        <p>
          We may change, suspend, rate-limit, or discontinue hosted features, and may restrict or terminate access to
          the Services for violations of these Terms, security threats, legal requirements, or risk to people,
          infrastructure, or the Services. This does not revoke rights already granted to database copies under the
          ODbL.
        </p>

        <h2>6. Disclaimers</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICES AND ALL HOSTED CONTENT ARE PROVIDED “AS IS” AND “AS
          AVAILABLE,” WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING ACCURACY, COMPLETENESS,
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AVAILABILITY, OR SECURITY. WE DO NOT
          WARRANT THAT ERRORS WILL BE CORRECTED OR THAT THE SERVICES WILL BE UNINTERRUPTED.
        </p>

        <h2>7. Limitation of liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, TEXTURE AND ITS AFFILIATES, CONTRIBUTORS, OFFICERS, EMPLOYEES, AND
          AGENTS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES,
          LOSS OF DATA OR PROFITS, OR DAMAGE ARISING FROM OPERATIONAL OR SAFETY RELIANCE ON THE SERVICES. TEXTURE’S
          TOTAL LIABILITY ARISING OUT OF THE SERVICES WILL NOT EXCEED THE GREATER OF $100 OR THE AMOUNT YOU PAID TEXTURE
          FOR THE SERVICES DURING THE TWELVE MONTHS BEFORE THE CLAIM.
        </p>

        <h2>8. Indemnity</h2>
        <p>
          To the extent permitted by law, you will defend, indemnify, and hold harmless Texture and its affiliates,
          officers, employees, and agents from claims, losses, and reasonable costs arising from your unlawful or
          prohibited use of the Services, your contributions, or your violation of these Terms. This obligation does not
          apply where prohibited by law.
        </p>

        <h2>9. Disputes and governing law</h2>
        <p>
          New York law governs these Terms, without regard to conflict-of-law rules. Before starting a formal dispute,
          you and Texture will give written notice and try in good faith to resolve the dispute for 30 days. If it is
          not resolved, either party may elect individual, non-representative, binding arbitration in English under the
          JAMS Streamlined Arbitration Rules. Hearings may occur remotely; any in-person hearing will occur in New York
          County, New York. Each party will bear its own costs. Texture may seek court relief to protect its
          intellectual property without waiving arbitration.
        </p>
        <div className="cg-legal-callout">
          YOU AND TEXTURE WAIVE THE RIGHT TO A JURY TRIAL AND TO PARTICIPATE IN A CLASS ACTION OR CLASS ARBITRATION, TO
          THE MAXIMUM EXTENT PERMITTED BY LAW.
        </div>

        <h2>10. General</h2>
        <p>
          These Terms and the policies they incorporate are the entire agreement about the Services and supersede prior
          discussions about them. If a provision is unenforceable, the remaining provisions remain effective. A failure
          to enforce a provision is not a waiver. You may not assign these Terms without Texture’s written consent;
          Texture may assign them as part of a merger, reorganization, sale, or transfer of the Services. Provisions
          that by their nature should survive termination—including license distinctions, disclaimers, liability limits,
          indemnity, and dispute terms—will survive.
        </p>

        <h2>11. Changes to these Terms</h2>
        <p>
          We may update these Terms. We will post the revised version and effective date, and may require renewed assent
          before continued use of interactive Services when changes are material.
        </p>

        <h2>12. Contact</h2>
        <p>
          Questions about these Terms may be sent to <a href="mailto:legal@texturehq.com">legal@texturehq.com</a>.
        </p>
      </article>
    </div>
  );
}
