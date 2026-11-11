import { describe, expect, it } from "vitest";
import { emailDomain, matchingDomain, normalizeDomain, utilityDomains, verifiedPrimaryEmail } from "./email-match";

const fourCounty = { website: "http://www.4county.org/", domains: null };

describe("normalizeDomain", () => {
  it("handles bare domains, URLs, www and case", () => {
    expect(normalizeDomain("4County.org")).toBe("4county.org");
    expect(normalizeDomain("http://www.4county.org/")).toBe("4county.org");
    expect(normalizeDomain("www.example.coop.")).toBe("example.coop");
  });

  it("rejects values that can't be a domain", () => {
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain(null)).toBeNull();
    expect(normalizeDomain("https://www.snopud-com")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
  });
});

describe("emailDomain", () => {
  it("takes the part after the last @", () => {
    expect(emailDomain("Jane.Doe@4County.org")).toBe("4county.org");
  });

  it("returns null for malformed emails", () => {
    expect(emailDomain("no-at-sign")).toBeNull();
    expect(emailDomain("@4county.org")).toBeNull();
    expect(emailDomain(null)).toBeNull();
  });
});

describe("utilityDomains", () => {
  it("merges domains and website, de-duplicated", () => {
    expect(
      utilityDomains({ website: "http://www.4county.org/", domains: ["4county.org", "4countyelectric.com"] })
    ).toEqual(["4county.org", "4countyelectric.com"]);
  });

  it("drops personal providers, shared website hosts and malformed websites", () => {
    expect(utilityDomains({ website: "https://www.snopud-com", domains: ["gmail.com"] })).toEqual([]);
    expect(utilityDomains({ website: "https://www.facebook.com/somecoop", domains: null })).toEqual([]);
  });
});

describe("matchingDomain", () => {
  it("matches the same domain and its subdomains", () => {
    expect(matchingDomain("jane@4county.org", fourCounty)).toBe("4county.org");
    expect(matchingDomain("jane@mail.4county.org", fourCounty)).toBe("4county.org");
  });

  it("doesn't match look-alikes or parent domains", () => {
    expect(matchingDomain("jane@not4county.org", fourCounty)).toBeNull();
    expect(matchingDomain("jane@4county.org.evil.com", fourCounty)).toBeNull();
    expect(matchingDomain("jane@coop.org", { website: "example.coop.org", domains: null })).toBeNull();
  });

  it("never matches personal email or a shared host", () => {
    expect(matchingDomain("jane@gmail.com", { website: null, domains: ["gmail.com"] })).toBeNull();
    expect(matchingDomain("someone@facebook.com", { website: "facebook.com/coop", domains: null })).toBeNull();
  });

  it("doesn't match when there's no email", () => {
    expect(matchingDomain(null, fourCounty)).toBeNull();
  });
});

describe("verifiedPrimaryEmail", () => {
  const user = (status: string | null) => ({
    primaryEmailAddress: {
      emailAddress: "jane@4county.org",
      verification: status === null ? null : { status },
    },
  });

  it("returns the primary email once verified", () => {
    expect(verifiedPrimaryEmail(user("verified"))).toBe("jane@4county.org");
  });

  it("returns null for an unverified or missing primary email", () => {
    expect(verifiedPrimaryEmail(user("unverified"))).toBeNull();
    expect(verifiedPrimaryEmail(user(null))).toBeNull();
    expect(verifiedPrimaryEmail({ primaryEmailAddress: null })).toBeNull();
    expect(verifiedPrimaryEmail(null)).toBeNull();
  });
});
