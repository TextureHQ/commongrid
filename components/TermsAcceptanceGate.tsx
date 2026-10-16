"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import {
  ACCEPTABLE_USE_PATH,
  ACCEPTABLE_USE_VERSION,
  ANONYMOUS_RECEIPT_STORAGE_KEY,
  PRIVACY_PATH,
  requiresPolicyAssent,
  TERMS_PATH,
  TERMS_STORAGE_KEY,
  TERMS_VERSION,
} from "@/lib/legal/policies";

function randomReceiptId(): string {
  return crypto.randomUUID();
}

function getAnonymousReceiptId(): string {
  const existing = window.localStorage.getItem(ANONYMOUS_RECEIPT_STORAGE_KEY);
  if (existing) return existing;
  const created = randomReceiptId();
  window.localStorage.setItem(ANONYMOUS_RECEIPT_STORAGE_KEY, created);
  return created;
}

export function TermsAcceptanceGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const gated = requiresPolicyAssent(pathname);
  const [checked, setChecked] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAccepted(window.localStorage.getItem(TERMS_STORAGE_KEY) === "accepted");
    setChecked(true);
  }, []);

  const blocked = gated && checked && !accepted;

  useEffect(() => {
    if (!blocked) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [blocked]);

  async function acceptPolicies() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/legal/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anonymousReceiptId: getAnonymousReceiptId(),
          termsVersion: TERMS_VERSION,
          acceptableUseVersion: ACCEPTABLE_USE_VERSION,
        }),
      });
      if (!response.ok) throw new Error("Could not record assent");
      window.localStorage.setItem(TERMS_STORAGE_KEY, "accepted");
      setAccepted(true);
    } catch {
      setError("We could not record your agreement. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div inert={blocked ? true : undefined} aria-hidden={blocked || undefined} className="contents">
        {children}
      </div>
      {blocked && (
        <div className="cg-policy-gate-backdrop">
          <section className="cg-policy-gate" role="dialog" aria-modal="true" aria-labelledby="policy-gate-title">
            <p className="cg-policy-gate-eyebrow">Before you explore</p>
            <h1 id="policy-gate-title">Use CommonGrid responsibly</h1>
            <p>
              CommonGrid contains public-source energy infrastructure information that may be incomplete or out of date.
              It is not an operational, safety, emergency-response, security, or reliability system.
            </p>
            <p>
              Do not use the hosted Services to maliciously target, disrupt, damage, or gain unauthorized access to
              infrastructure, systems, personnel, or communities.
            </p>
            <p className="cg-policy-gate-license">
              The database remains available under ODbL 1.0. These rules govern use of CommonGrid’s hosted Services, not
              the database rights granted by that license.
            </p>
            <p className="cg-policy-gate-links">
              Review the <Link href={TERMS_PATH}>Terms of Use</Link>,{" "}
              <Link href={ACCEPTABLE_USE_PATH}>Acceptable Use Policy</Link>, and{" "}
              <Link href={PRIVACY_PATH}>Privacy Notice</Link>.
            </p>
            {error && (
              <p className="cg-policy-gate-error" role="alert">
                {error}
              </p>
            )}
            <button type="button" onClick={acceptPolicies} disabled={submitting}>
              {submitting ? "Recording agreement…" : "I agree and will use CommonGrid responsibly"}
            </button>
          </section>
        </div>
      )}
    </>
  );
}
