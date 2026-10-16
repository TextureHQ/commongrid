import type { Metadata } from "next";
import { POLICY_EFFECTIVE_DATE } from "@/lib/legal/policies";
import "../legal.css";

export const metadata: Metadata = { title: "Privacy Notice" };

export default function PrivacyPage() {
  return (
    <div className="cg-legal-page">
      <article className="cg-legal-inner">
        <h1>Privacy Notice</h1>
        <p className="cg-legal-effective">Effective {POLICY_EFFECTIVE_DATE}</p>
        <p>
          This CommonGrid notice supplements Texture’s broader{" "}
          <a href="https://www.texturehq.com/company/privacy-policy">Privacy Policy</a>, which applies to CommonGrid and
          describes your choices and Texture’s general privacy practices.
        </p>
        <p>
          CommonGrid processes account information you provide; contributions and moderation activity; device, browser,
          request, and security data; and analytics needed to operate, secure, and improve the Services. Our providers
          include Clerk (authentication), Vercel and Neon (hosting and data storage), Mapbox (maps), Google Analytics
          and PostHog (analytics), and Sentry (error monitoring). Their processing is also subject to their respective
          policies and our agreements with them.
        </p>
        <p>
          When you accept our Terms, we record the policy versions and a server timestamp. For signed-out visitors, the
          assent receipt uses a random browser identifier stored only in hashed form; the assent record does not
          intentionally store a raw IP address, user agent, or precise location. Other service and security systems may
          process request metadata as described in Texture’s Privacy Policy.
        </p>
        <p>
          We use information to provide accounts and features, maintain an auditable contribution history, remember
          policy assent, prevent abuse, monitor reliability, analyze usage, and comply with law. We retain it as
          reasonably necessary for those purposes.
        </p>
        <p>
          Contact <a href="mailto:privacy@texturehq.com">privacy@texturehq.com</a> with privacy questions or requests.
        </p>
      </article>
    </div>
  );
}
