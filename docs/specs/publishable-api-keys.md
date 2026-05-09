# CommonGrid Publishable API Keys (`cg_pk_*`) with Origin Allowlists

## Product Requirements Document (PRD)

**Linear:** ALL-821  
**Author:** Meridian  
**Date:** May 9, 2026  
**Status:** Draft for engineering + product review  
**Scope:** PRD only — no implementation in this document

---

## 1. Executive Summary

CommonGrid currently supports a public, open API and a developer API-key model oriented around server-side use. That is enough for backend integrations, notebooks, and CLI workflows, but it leaves browser applications with an awkward choice:

1. Call the anonymous public API and live inside low IP-based limits, or
2. Embed a server API key in browser code, which is unsafe because browser bundles are public.

This PRD specifies a Mapbox-style key model for CommonGrid:

- **Secret server keys** use the `cg_sk_*` prefix. They are intended for trusted server environments, CI jobs, scripts, and data pipelines.
- **Publishable browser keys** use the `cg_pk_*` prefix. They are intentionally safe to publish in frontend bundles when paired with an **origin allowlist** and read-only scopes.

A publishable key does not make public data private. It gives a browser app an app-level identity for higher rate limits, usage analytics, revocation, and abuse controls while preserving CommonGrid's open-source covenant: the same public API-key model is available to any developer, researcher, journalist, or company.

The guiding analogy is Mapbox public access tokens: the token appears in client-side code, but it is constrained by allowed origins, scopes, quotas, and revocation.

---

## 2. Problem Statement

### 2.1 Current State

CommonGrid's public API is designed for broad reuse:

- Public read endpoints are available under `/api/v1/*`.
- Public tile endpoints are available under `/api/tiles/*`.
- Public CORS currently allows third-party browser clients with `Access-Control-Allow-Origin: *`.
- Current rate-limit tiers are documented as:
  - Anonymous: 60 requests/hour, 10 requests/min burst
  - Registered: 5,000 requests/hour, 100 requests/min burst
  - Bulk: 50,000 requests/hour, 500 requests/min burst
- Existing API-key implementation uses the legacy `cg_*` prefix and stores only a hash.

### 2.2 Gap

A frontend-only application that wants to build on CommonGrid needs an identity and quota without exposing a server secret. Examples:

- A civic map showing utility territories and power plants.
- A university research dashboard embedded on a public website.
- A data journalism visualization that queries CommonGrid directly from the reader's browser.
- A startup prototype that uses CommonGrid lookup endpoints before it has a backend.

These clients should not embed a `cg_sk_*` server key. But forcing them onto anonymous limits creates unnecessary friction and makes usage analytics impossible.

### 2.3 Why CORS Alone Is Not Enough

CORS is a browser runtime policy, not an access-control system for public data. Anything CommonGrid exposes publicly can be fetched by a server-side script regardless of CORS headers.

Origin allowlists should therefore be enforced by CommonGrid's API-key layer, not by hiding CORS responses. The API should still return developer-readable JSON errors cross-origin; the allowlist determines whether a presented `cg_pk_*` key receives authenticated quota.

---

## 3. Goals and Non-Goals

### 3.1 Goals

- Provide browser-safe API keys with the `cg_pk_*` prefix.
- Preserve server-side API keys with the `cg_sk_*` prefix.
- Let developers configure allowed origins for each publishable key.
- Ensure publishable keys are read-only in V1.
- Give browser apps registered/bulk rate-limit tiers without exposing server secrets.
- Attribute usage by key, origin, endpoint, status code, and tier.
- Produce predictable JSON errors for invalid origins, missing origins, insufficient scopes, and rate limits.
- Keep public unauthenticated API reads available with permissive CORS.
- Design the schema so future org/team accounts can share keys without redesign.
- Stay fully covenant-compliant: no Texture-only key type, route, schema, role, or hidden internal surface.

### 3.2 Non-Goals

- Paid API tiers or monetization.
- Making public CommonGrid data private.
- Treating CORS as a security boundary.
- Supporting browser writes with publishable keys in V1.
- Supporting mobile bundle restrictions, package-name restrictions, or app-store attestation in V1.
- Supporting per-end-user identity, user-specific private data, or cookie-authenticated cross-origin flows.
- Supporting query-string API keys in V1, except as a future compatibility consideration for tile clients that cannot send headers.
- Replacing Clerk/user-session auth for the developer dashboard or contribution workflows.

---

## 4. Key Types and Capabilities

### 4.1 Summary

| Key type | Prefix | Intended environment | Safe to publish? | Origin required? | V1 scopes | Default tier |
|---|---:|---|---:|---:|---|---|
| Anonymous | none | Any client | n/a | No | Public reads only | `anonymous` |
| Publishable | `cg_pk_*` | Browser/frontend bundles | Yes | Yes | Public reads only | `registered` |
| Secret | `cg_sk_*` | Servers, scripts, CI, notebooks | No | No | Read scopes; write scopes if granted | `registered` |
| Legacy | `cg_*` | Existing integrations | No | No | Existing stored scopes | Existing stored tier |

### 4.2 Publishable Keys (`cg_pk_*`)

Publishable keys are app identifiers, not secrets. They may appear in:

- Browser JavaScript bundles.
- Static websites.
- Public GitHub repositories.
- Map clients such as Mapbox GL JS / MapLibre / PMTiles fetch hooks.
- Public examples and documentation.

Their safety comes from constraints:

1. **Origin allowlist:** browser requests must include an `Origin` header matching a configured allowed origin.
2. **Read-only scopes:** V1 publishable keys can only call public read endpoints.
3. **Rate-limit buckets:** usage is charged to the key and visible in the developer dashboard.
4. **Revocation:** developers can revoke or rotate keys without affecting other apps.
5. **Abuse monitoring:** invalid-origin attempts and unusual usage patterns are tracked.

### 4.3 Secret Keys (`cg_sk_*`)

Secret keys are for trusted environments:

- Backend services.
- Serverless functions.
- CI workflows.
- ETL jobs.
- Research scripts and notebooks where the environment is not publicly distributed.

Secret keys may carry broader scopes, including future contribution/write scopes, subject to explicit product and moderation rules. Secret keys must never be embedded in browser bundles or public mobile apps.

### 4.4 Legacy `cg_*` Keys

Existing `cg_*` keys remain valid during migration and are treated as secret server keys unless their database row explicitly says otherwise.

Newly created keys should use typed prefixes:

- `cg_pk_*` for publishable/browser keys.
- `cg_sk_*` for secret/server keys.

A deprecation date for creating new legacy `cg_*` keys can be set after typed-key creation ships. Existing keys should not be revoked automatically.

---

## 5. Product Experience

### 5.1 Key Creation Flow

In `/developers/dashboard` → **API Keys** → **Create key**, developers choose:

1. **Browser / publishable key**
   - Label: "Use in frontend code"
   - Prefix: `cg_pk_*`
   - Requires at least one allowed origin before production use.
   - Read-only scopes only.
2. **Server / secret key**
   - Label: "Use only in trusted server environments"
   - Prefix: `cg_sk_*`
   - No origin allowlist required.
   - Can request additional scopes when supported.

Required fields for both:

- Key name: e.g. `Research dashboard production`.
- App name: e.g. `Grid Atlas`.
- Use case: research, commercial application, personal project, open source, government/non-profit, data journalism, other.
- Description: 1-3 sentences.
- Agreement to acceptable-use policy and attribution/license terms.

Additional required fields for publishable keys:

- Allowed origins (at least one before the key can receive authenticated browser quota).
- Optional development origins, such as `http://localhost:3000`.

### 5.2 Publishable Key Success Screen

The success screen should say:

> This is a publishable CommonGrid key. It is safe to use in browser code, but only from the origins you allowlisted. Do not use it for server-side jobs or private writes.

Example:

```bash
curl \
  -H "Authorization: Bearer cg_pk_abc123..." \
  -H "Origin: https://example.org" \
  "https://commongrid.info/api/v1/utilities?state=VT"
```

JavaScript example:

```ts
const response = await fetch("https://commongrid.info/api/v1/utilities?state=VT", {
  headers: {
    Authorization: `Bearer ${COMMON_GRID_PUBLISHABLE_KEY}`,
  },
});
```

The browser automatically sends the `Origin` header for cross-origin requests. Developers should not attempt to set `Origin` manually; browsers block that.

### 5.3 Secret Key Success Screen

The secret-key screen should continue to warn:

> This is the only time your secret key will be shown. Store it securely. Never commit it to GitHub or embed it in frontend code.

### 5.4 Key Management

The API Keys tab should show:

- Key name.
- Key type: Publishable or Secret.
- Key prefix / identifier: e.g. `cg_pk_abc123…`.
- Tier: registered or bulk.
- Scopes.
- Allowed origins count, with a quick preview for publishable keys.
- Created at.
- Last used at.
- Last used endpoint.
- Last used origin, for publishable keys.
- Status: active, revoked, expired.
- Actions: edit origins, rename, rotate, revoke.

For publishable keys, product can choose one of two display policies:

1. **One-time reveal, same as secret keys** — safest and simplest with hash-only storage.
2. **Re-copyable publishable key** — closer to Mapbox UX; requires storing publishable token material encrypted at rest or using a reconstructable signed-token format.

Recommendation for V1: one-time reveal unless product strongly wants Mapbox-style re-copy. Browser keys are publishable, but losing a key should still be solved by rotation rather than storing plaintext casually.

---

## 6. Origin Allowlist Model

### 6.1 Definition of an Origin

An origin is exactly:

```text
<scheme>://<host>[:port]
```

Examples:

```text
https://example.org
https://www.example.org
https://app.example.org
https://staging.example.org
http://localhost:3000
http://127.0.0.1:5173
```

Not origins:

```text
https://example.org/path
https://example.org?x=1
*.example.org
example.org
```

The dashboard should validate and canonicalize origin input:

- Require `http` or `https` scheme.
- Strip paths, query strings, fragments, and trailing slashes only if the UI clearly tells the user what was stored; otherwise reject with a helpful error.
- Lowercase hostnames.
- Punycode internationalized domain names.
- Remove default ports (`:443` for HTTPS, `:80` for HTTP).
- Preserve non-default ports.
- Reject credentials in URLs (`https://user:pass@example.org`).

### 6.2 Exact Origins

Exact origins are the V1 default and should be supported first.

An exact allowlist entry `https://app.example.org` matches only requests with:

```http
Origin: https://app.example.org
```

It does not match:

```http
Origin: https://example.org
Origin: https://www.example.org
Origin: http://app.example.org
Origin: https://app.example.org:8443
```

### 6.3 Wildcard Origins

Wildcard origins are useful but easy to misconfigure. They can ship in V1 only if engineering can implement strict validation and clear UI warnings.

Allowed wildcard form:

```text
https://*.example.org
```

Rules:

- Wildcard must be the entire left-most DNS label.
- Wildcard only applies to `https` origins, except localhost development patterns.
- Wildcard does **not** match the apex domain. Developers must separately add `https://example.org`.
- Wildcard should match one or more subdomain labels under the suffix. For example, `https://*.example.org` matches `https://app.example.org` and `https://staging.app.example.org`.
- Wildcard entries for public suffixes are rejected (`https://*.com`, `https://*.co.uk`, `https://*.github.io` unless product explicitly decides otherwise).
- Dashboard copy must warn: "Any subdomain that can run JavaScript can use this key. Only use wildcards when you control all matching subdomains."

Recommendation: exact origins in initial implementation; wildcard origins behind a small follow-up if not needed immediately.

### 6.4 Local Development Origins

Developers need local testing. Support exact localhost origins in V1:

```text
http://localhost:3000
http://localhost:5173
http://127.0.0.1:3000
```

Optional developer convenience:

```text
http://localhost:*
http://127.0.0.1:*
```

If wildcard ports are supported, they must be limited to loopback hosts only.

### 6.5 `Origin: null`

Requests with `Origin: null` come from contexts such as `file://`, sandboxed iframes, opaque origins, and some privacy-preserving browser modes.

V1 behavior:

- Do not allow `Origin: null` for publishable keys.
- Return a clear 403 explaining that publishable keys require an allowlisted HTTP(S) origin.
- Recommend local dev via `http://localhost:<port>` rather than opening an HTML file directly.

### 6.6 Missing `Origin`

Browser CORS requests that include an `Authorization` header should send `Origin`. Server-side scripts generally do not.

V1 behavior:

- A request with `cg_pk_*` and no `Origin` is rejected with 403 `PUBLISHABLE_KEY_ORIGIN_REQUIRED`.
- A request with `cg_sk_*` and no `Origin` is allowed if the key is otherwise valid.
- A request with no key and no `Origin` remains anonymous.

This prevents developers from using publishable keys as server keys. Server environments should use `cg_sk_*`.

---

## 7. API Contract

### 7.1 Authentication Header

Clients authenticate with the standard bearer token header:

```http
Authorization: Bearer cg_pk_...
Authorization: Bearer cg_sk_...
```

V1 should not support API keys in query parameters by default.

Rationale:

- Query-string keys are commonly logged by proxies, analytics, browser history, and referrers.
- `Authorization` works with browser `fetch` and causes a CORS preflight that includes the origin.
- Map clients that need custom headers can usually set them via request hooks (`transformRequest`, custom fetch, or PMTiles fetch options).

Future compatibility option:

- A narrowly scoped `?access_token=cg_pk_*` path can be considered later for tile/image clients that cannot send headers. If added, it must be publishable-key-only, read-only, origin-checked where browsers provide an origin, and documented as less preferred.

### 7.2 CORS Headers

Public API and tile routes should remain browser-callable from any origin. The allowlist is enforced by API logic, not by withholding CORS.

Recommended public API CORS response:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Requested-With
Access-Control-Expose-Headers: ETag, Cache-Control, Content-Type, X-Total-Count, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-RateLimit-Tier, X-CommonGrid-Key-Type, X-CommonGrid-Origin-Status, X-Request-Id
Access-Control-Max-Age: 86400
Vary: Origin
```

CommonGrid should not set `Access-Control-Allow-Credentials: true` for public `*` CORS responses. Browser clients should not call CommonGrid public APIs with `credentials: "include"`.

### 7.3 Preflight Requests

`OPTIONS` preflight requests should:

- Return 204.
- Include public API CORS headers.
- Not require API-key validation.
- Not count against rate limits.
- Not reveal whether a key would be valid.

The actual request performs key validation and origin enforcement.

### 7.4 Successful Authenticated Read Response

Example response headers for a valid publishable key:

```http
X-RateLimit-Limit: 5000
X-RateLimit-Remaining: 4832
X-RateLimit-Reset: 1778292000
X-RateLimit-Tier: registered
X-CommonGrid-Key-Type: publishable
X-CommonGrid-Origin-Status: allowed
X-Request-Id: req_...
```

The response body is the same public data an anonymous caller would receive. Authentication changes quota, attribution, and analytics — not the public read payload.

### 7.5 Error Response Shape

All API-key/auth/rate-limit errors should use the standard CommonGrid error envelope:

```json
{
  "error": {
    "code": "ORIGIN_NOT_ALLOWED",
    "message": "This publishable API key is not allowed from the request origin.",
    "request_id": "req_abc123",
    "timestamp": "2026-05-09T02:00:00.000Z",
    "docs": "https://commongrid.info/developers/docs/publishable-keys"
  }
}
```

### 7.6 Error Codes

| HTTP | Code | When | Counts against key quota? |
|---:|---|---|---:|
| 401 | `MISSING_API_KEY` | Endpoint requires auth and no key was provided | No |
| 401 | `INVALID_API_KEY` | Key prefix/hash not recognized | No |
| 401 | `EXPIRED_API_KEY` | Key exists but expired | No |
| 403 | `REVOKED_API_KEY` | Key exists but inactive/revoked | No |
| 403 | `INSUFFICIENT_SCOPE` | Key lacks required scope | No |
| 403 | `PUBLISHABLE_KEY_ORIGIN_REQUIRED` | `cg_pk_*` was used without an `Origin` header | No |
| 403 | `ORIGIN_NOT_ALLOWED` | `Origin` did not match allowlist | No; count in abuse telemetry |
| 403 | `PUBLISHABLE_KEY_WRITE_FORBIDDEN` | `cg_pk_*` attempted a write/mutation | No; count in abuse telemetry |
| 429 | `RATE_LIMITED` | Valid caller exceeded tier quota | Yes |

For public read endpoints, omitting the key entirely should continue as anonymous. The 403 cases above apply when a caller explicitly presents a `cg_pk_*` key incorrectly.

### 7.7 `ORIGIN_NOT_ALLOWED` Example

```json
{
  "error": {
    "code": "ORIGIN_NOT_ALLOWED",
    "message": "This publishable API key is not allowed from origin https://evil.example. Add the origin in your CommonGrid developer dashboard or remove the API key to use anonymous access.",
    "request_id": "req_abc123",
    "timestamp": "2026-05-09T02:00:00.000Z",
    "docs": "https://commongrid.info/developers/docs/publishable-keys#allowed-origins"
  }
}
```

Do not include the key's full allowlist in the error response. It is enough to echo the rejected origin.

---

## 8. Data Model / Schema

This section describes the target data model. Names are proposed and can be adjusted during implementation.

### 8.1 `api_keys` Additions

Existing table: `api_keys`.

Add or standardize fields:

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | text/uuid | Yes | Existing primary key |
| `name` | text | Yes | User-visible key name |
| `key_hash` | text | Yes | SHA-256 or stronger hash of full token/verifier; unique |
| `key_prefix` | text | Yes | Display prefix, e.g. `cg_pk_abcd1234` |
| `key_type` | text enum | Yes | `publishable`, `secret`, `legacy` |
| `scopes` | text[] | Yes | Existing scope list |
| `tier` | text enum | Yes | `registered`, `bulk`; existing field |
| `user_id` | text | Yes for dashboard keys | Owner user FK |
| `organization_id` | text | No | Phase 2 org accounts |
| `app_name` | text | No | Existing developer metadata |
| `app_url` | text | No | Existing developer metadata |
| `use_case` | text | No | Existing developer metadata |
| `description` | text | No | Existing developer metadata |
| `rotation_group` | text | No | Existing rotation support |
| `expires_at` | timestamptz | No | Expiration |
| `last_used_at` | timestamptz | No | Existing telemetry |
| `last_used_endpoint` | text | No | Existing telemetry |
| `last_used_origin` | text | No | New for publishable keys |
| `is_active` | boolean | Yes | Existing active/revoked flag |
| `created_at` | timestamptz | Yes | Existing |
| `updated_at` | timestamptz | Yes | New or existing convention |
| `revoked_at` | timestamptz | No | Prefer explicit revoke timestamp |
| `revoked_reason` | text | No | User/admin/system reason |

Recommended constraints:

- `key_type IN ('publishable', 'secret', 'legacy')`.
- `tier IN ('registered', 'bulk')` for authenticated keys.
- `key_type = 'publishable'` implies no write scopes.
- New `cg_pk_*` tokens must map to `key_type = 'publishable'`.
- New `cg_sk_*` tokens must map to `key_type = 'secret'`.
- Legacy `cg_*` tokens should map to `key_type = 'legacy'` or `secret` during migration.

### 8.2 `api_key_allowed_origins`

Create a separate table rather than storing origins only as a text array. A table supports auditing, status, future verification, and per-origin analytics.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | text/uuid | Yes | Primary key |
| `api_key_id` | text/uuid | Yes | FK to `api_keys(id)`; cascade delete |
| `origin` | text | Yes | Canonical origin or wildcard pattern |
| `match_type` | text enum | Yes | `exact`, `wildcard_subdomain`, `localhost_wildcard_port` |
| `is_enabled` | boolean | Yes | Allows soft-disable without deleting history |
| `created_at` | timestamptz | Yes | Created timestamp |
| `updated_at` | timestamptz | Yes | Updated timestamp |
| `created_by_user_id` | text | No | User who added origin |
| `last_used_at` | timestamptz | No | Last successful request from this origin |

Recommended indexes:

- `(api_key_id, is_enabled)` for enforcement.
- Unique `(api_key_id, origin)`.
- Optional trigram/text index only if wildcard matching becomes expensive; exact matching should dominate.

### 8.3 `api_key_usage_events` Additions

Existing usage tracking should capture publishable-key dimensions.

Add fields if not already present:

| Column | Type | Required | Notes |
|---|---|---:|---|
| `api_key_id` | text/uuid | No | Null for anonymous |
| `key_type` | text | No | `publishable`, `secret`, `legacy`, `anonymous` |
| `origin` | text | No | Raw/canonical request origin |
| `origin_status` | text | No | `allowed`, `missing`, `not_allowed`, `null`, `not_applicable` |
| `matched_origin_id` | text/uuid | No | FK to allowlist row when matched |
| `rate_limit_tier` | text | Yes | Tier applied |
| `rate_limit_identifier_hash` | text | No | Hashed bucket identifier for debugging without exposing key/IP |
| `endpoint` | text | Yes | Normalized route pattern, not raw high-cardinality URL if possible |
| `method` | text | Yes | HTTP method |
| `status_code` | integer | Yes | Response status |
| `request_id` | text | Yes | Correlates logs/support |
| `ip_hash` | text | No | Privacy-preserving abuse analysis |
| `user_agent_family` | text | No | Optional coarse UA family |
| `created_at` | timestamptz | Yes | Event timestamp |

Do not store full API keys, raw IP addresses, or unnecessary personal data in usage events.

### 8.4 Optional `api_key_security_events`

For audit/security review, consider a separate append-only table for exceptional events:

- Invalid-origin attempt.
- Publishable key used without origin.
- Publishable key attempted write.
- Secret key observed with browser-like origin from many origins.
- Rate-limit abuse.
- Admin revoke.
- User revoke.

This can also be represented in `api_key_usage_events` if event volume is manageable.

### 8.5 Token Format

Implementation may choose exact random lengths, but the format should be parseable without database lookup:

```text
cg_pk_<public_identifier>_<verifier>
cg_sk_<public_identifier>_<verifier>
```

Requirements:

- Prefix identifies intended key type.
- Public identifier is safe to log/display partially and can speed database lookup.
- Verifier is high-entropy random material.
- Store only a hash of the verifier/full token for secret keys.
- Do not log full tokens.
- Redaction utilities must recognize `cg_pk_`, `cg_sk_`, and legacy `cg_` patterns.

Example redaction:

```text
cg_pk_abc12345_••••••••••••
cg_sk_def67890_••••••••••••
```

---

## 9. Authentication and Enforcement Algorithm

### 9.1 High-Level Flow

For every non-OPTIONS request to a public API route:

1. Generate or propagate `X-Request-Id`.
2. Parse `Authorization: Bearer <token>` if present.
3. If no token:
   - Use anonymous identity.
   - Apply anonymous rate limit by IP-derived identifier.
4. If token has `cg_pk_*` prefix:
   - Lookup key by identifier/hash.
   - Verify active/not expired.
   - Verify key type is publishable.
   - Verify endpoint/action is a public read.
   - Verify `Origin` is present and not `null`.
   - Canonicalize `Origin`.
   - Match against enabled allowlist entries.
   - Apply publishable key rate limit.
   - Record usage with origin dimensions.
5. If token has `cg_sk_*` or legacy `cg_*` prefix:
   - Lookup key by hash.
   - Verify active/not expired.
   - Verify scopes.
   - Apply secret/legacy key rate limit.
   - Record usage.
6. If auth/rate limit succeeds, execute route.
7. Attach rate-limit and request-id headers to response.

### 9.2 Pseudocode

```ts
const token = parseBearer(request.headers.get("authorization"));
const originHeader = request.headers.get("origin");

if (request.method === "OPTIONS") {
  return publicPreflight204();
}

if (!token) {
  const rate = await checkRateLimit(ipBucket(request), "anonymous");
  return rate.ok ? routeAsAnonymous() : rateLimit429(rate);
}

const parsed = parseCommonGridToken(token);

if (parsed.type === "publishable") {
  const key = await loadAndVerifyKey(parsed, "publishable");
  assertReadOnlyRoute(request);

  const origin = canonicalizeRequiredOrigin(originHeader);
  const match = await matchAllowedOrigin(key.id, origin);
  if (!match) throw originNotAllowed403(origin);

  const rate = await checkRateLimit(publishableBucket(key.id), key.tier);
  if (!rate.ok) return rateLimit429(rate);

  return routeWithIdentity({ key, keyType: "publishable", origin, match });
}

if (parsed.type === "secret" || parsed.type === "legacy") {
  const key = await loadAndVerifyKey(parsed, parsed.type);
  assertScopes(key, routeResource, routeAction);

  const rate = await checkRateLimit(secretBucket(key.id), key.tier);
  if (!rate.ok) return rateLimit429(rate);

  return routeWithIdentity({ key, keyType: parsed.type });
}

throw invalidApiKey401();
```

### 9.3 Route Eligibility for Publishable Keys

Publishable keys may only be accepted on routes classified as:

```text
public_read
```

Examples likely eligible:

- `GET /api/v1/utilities`
- `GET /api/v1/utilities/{slug}`
- `GET /api/v1/utilities/by-eia-id/{eia_id}`
- `GET /api/v1/utilities/{slug}/geometry`
- `POST /api/v1/utilities/resolve` if product classifies it as public read despite POST method
- `GET /api/v1/territories/{slug}/geometry`
- `GET /api/v1/search`
- Public PMTiles/tile fetches

Routes not eligible in V1:

- Contribution submission or moderation routes.
- Developer dashboard APIs.
- User/account routes.
- Notification routes.
- Any route requiring Clerk session auth.
- Any route that writes, mutates, queues jobs, or exposes user-specific/private data.

Important nuance: HTTP method alone is not enough. `POST /api/v1/utilities/resolve` is semantically a read/lookup endpoint and may be publishable-key eligible if product approves. Conversely, any `GET` route returning user-specific data is not eligible.

### 9.4 Scope Rules

Recommended V1 scopes:

- Publishable default: `public:read` or `*:read` restricted by key type to public-read routes only.
- Secret default: `*:read`.
- Secret optional future: entity-specific write/contribution scopes.

Even if a publishable key row accidentally receives `*:write`, enforcement must deny writes because `key_type = 'publishable'` is not eligible for write actions.

---

## 10. Rate Limits and Usage Accounting

### 10.1 Tier Limits

Use the existing tiers unless product changes them:

| Tier | Applies to | Hourly limit | Burst limit |
|---|---|---:|---:|
| `anonymous` | No key | 60/hour | 10/min |
| `registered` | Valid `cg_pk_*`, `cg_sk_*`, legacy `cg_*` | 5,000/hour | 100/min |
| `bulk` | Approved key | 50,000/hour | 500/min |
| `write` | Mutating secret-key actions | 100/min | n/a |

Publishable keys can be upgraded to `bulk` through the same public developer workflow as secret keys.

### 10.2 Rate-Limit Bucket Identity

Recommended buckets:

| Caller | Primary bucket | Secondary abuse guard |
|---|---|---|
| Anonymous | IP hash | Endpoint-specific burst |
| Publishable | API key ID | Optional key+origin, IP+key abuse telemetry |
| Secret | API key ID | Optional IP+key anomaly telemetry |
| Invalid key | IP hash | Prefix/key-prefix hash abuse telemetry |
| Invalid publishable origin | IP hash or key-prefix hash | Do not charge key owner quota |

Do not charge a key owner's quota for invalid-origin attempts. A malicious third party can copy a publishable key from a site; origin enforcement should block them without burning the owner's legitimate quota. These attempts should still be counted in security telemetry and have their own IP/key-prefix abuse limits.

### 10.3 What Counts

Count all non-OPTIONS requests that pass authentication/origin checks and reach the route layer, including:

- 200/204 success.
- 304 not modified.
- 400 validation errors after auth.
- 404 not found after auth.
- 5xx errors after auth, though product may choose to refund systemic outage periods in analytics.

Do not count:

- OPTIONS preflights.
- Invalid API keys.
- Revoked/expired keys.
- Publishable key missing origin.
- Publishable key invalid origin.
- Insufficient scope.

### 10.4 Headers

Every non-OPTIONS API response should include rate-limit headers for the tier actually applied:

```http
X-RateLimit-Limit: 5000
X-RateLimit-Remaining: 4832
X-RateLimit-Reset: 1778292000
X-RateLimit-Tier: registered
```

For publishable keys, also include:

```http
X-CommonGrid-Key-Type: publishable
X-CommonGrid-Origin-Status: allowed
```

For anonymous calls nearing limits, continue the existing registration nudge:

```http
X-CommonGrid-Register: You're approaching the anonymous rate limit. Register for a free API key at https://commongrid.info/developers for 5,000 req/hr.
```

### 10.5 CDN and Cache Interaction

Public read response bodies are identical across anonymous, publishable, and secret callers. This allows public CDN caching of the body.

However, API-key-specific headers must not be cached and served to other callers.

Implementation requirement:

- If a route uses public CDN caching, ensure `X-RateLimit-*`, `X-CommonGrid-Key-Type`, `X-CommonGrid-Origin-Status`, and `X-Request-Id` are generated per request and not cached with the body.
- If the hosting platform cannot separate cached body from dynamic headers, either bypass CDN cache for authenticated-key requests or omit per-key rate-limit headers on CDN hits while still enforcing limits in edge middleware.
- Add regression tests or platform verification for cached endpoints.

This is an engineering review hotspot because CommonGrid intentionally uses long-lived public caching for stable grid data.

---

## 11. Security and Abuse Considerations

### 11.1 Threat Model

Publishable keys assume the key string is public. The main risks are:

- A third party copies a key and uses it from a non-allowlisted origin.
- A malicious script runs on an allowlisted origin through XSS or compromised dependencies.
- A developer accidentally allowlists too broad a wildcard.
- A developer uses a publishable key server-side, bypassing browser origin headers.
- A botnet visits an allowlisted website and consumes quota through real browsers.
- A public site's key is scraped and used for server-side requests without `Origin`.

V1 mitigations:

- Reject missing/`null` origins for publishable keys.
- Strict exact-origin matching by default.
- Read-only publishable keys.
- Per-key quotas and revocation.
- Invalid-origin telemetry and alerts.
- Dashboard warnings for wildcards and localhost.
- No cookie credentials on public API CORS.

### 11.2 What Origin Allowlists Do Not Protect Against

Origin allowlists do not prove site ownership and do not protect against all abuse:

- If an attacker can run JavaScript on an allowlisted origin, they can use the key.
- If a developer allowlists `https://*.example.org` and untrusted users can create subdomains, those users can use the key.
- Browser extensions, proxies, and non-browser clients may have unusual headers.
- Native mobile apps generally do not provide trustworthy web origins.

The dashboard and docs should frame allowlists as quota/abuse controls, not as cryptographic ownership.

### 11.3 Secret Scanning

Update secret-scanning/redaction patterns to recognize:

- `cg_sk_*` as a high-severity secret.
- Legacy `cg_*` as a high-severity secret until fully migrated.
- `cg_pk_*` as publishable but still worth warning on if found outside expected frontend config/docs.

GitHub secret scanning for `cg_sk_*` should trigger automatic user notification and possibly auto-revocation once the operational process exists.

### 11.4 Admin Controls

Admins should be able to:

- Search keys by prefix, user, app name, origin, endpoint, and status.
- Revoke a key with a reason.
- Disable one origin without revoking the key.
- Upgrade/downgrade tier.
- View invalid-origin attempts.
- View top origins/endpoints for a key.
- Mark an account as suspicious and temporarily force anonymous-only access.

All admin actions should be audited.

---

## 12. Edge Cases

### 12.1 Same Site vs Cross Site

A browser request from `https://example.org` to `https://commongrid.info` with an `Authorization` header is cross-origin and should include `Origin: https://example.org`.

If a developer proxies through their own server, the server request will usually have no `Origin`; that proxy should use a `cg_sk_*` key instead.

### 12.2 `www` vs Apex Domains

`https://example.org` and `https://www.example.org` are different origins. The dashboard should suggest adding both when a user enters one and the app URL indicates the other.

### 12.3 Scheme Differences

`http://example.org` and `https://example.org` are different origins. Production origins should be HTTPS. Non-localhost HTTP origins should show a warning or be rejected unless product explicitly allows them.

Recommendation: allow non-localhost HTTP only behind a confirmation warning for development/staging edge cases; strongly prefer HTTPS.

### 12.4 Ports

Ports are part of the origin. `https://example.org:8443` does not match `https://example.org`.

Default ports should canonicalize away:

- `https://example.org:443` → `https://example.org`
- `http://example.org:80` → `http://example.org`

### 12.5 Paths in Dashboard Input

If a user enters `https://example.org/app`, the stored origin is not that full URL. Product options:

1. Reject and explain: "Allowed origins cannot include paths. Use `https://example.org`."
2. Canonicalize and confirm: "We'll allow all paths on `https://example.org`."

Recommendation: reject in V1 for clarity.

### 12.6 Browser Extensions

Origins such as `chrome-extension://...` are not HTTP(S). V1 should reject them. Extension authors can either use anonymous access or proxy through a backend with a secret key. If extension use becomes important, add an explicit extension-origin model later.

### 12.7 Native Mobile Apps and WebViews

Native apps and many WebViews do not produce trustworthy website origins. V1 publishable keys are for browser origins only. Native apps should use a backend proxy or anonymous access. Do not embed `cg_sk_*` in mobile bundles.

### 12.8 Service Workers

Service workers run under their registered origin. Requests they make should carry that origin when cross-origin. They should work with publishable keys if the site origin is allowlisted.

### 12.9 Server-Side Rendering

Frameworks like Next.js may run the same code in both browser and server contexts. Developers should:

- Use `cg_pk_*` only in browser-executed code.
- Use `cg_sk_*` only in server-only code.
- Avoid exposing `cg_sk_*` through `NEXT_PUBLIC_*` or equivalent public env vars.

Docs should include a short Next.js example showing separate `NEXT_PUBLIC_COMMONGRID_PUBLISHABLE_KEY` and server-only `COMMONGRID_SECRET_KEY` names.

### 12.10 Public API Without Key from Disallowed Origin

If a browser from `https://not-allowlisted.example` calls CommonGrid **without** an API key, the request remains anonymous and should not be blocked by origin allowlists.

If that browser sends a `cg_pk_*` key that is not allowlisted, return 403 for that keyed request. The caller can remove the key to use anonymous access.

### 12.11 Resolver Endpoint with POST Method

`POST /api/v1/utilities/resolve` is a public lookup even though it uses POST for request-body ergonomics. Product should classify it explicitly:

- If classified as `public_read`, publishable keys may call it.
- If classified as `server_only_read`, require `cg_sk_*`.

Recommendation: classify as `public_read` if the endpoint remains safe, cacheable in spirit, and useful to browser apps. This fits CommonGrid's public utility lookup mission.

### 12.12 Tile and PMTiles Fetches

Some map libraries can attach headers to tile requests; others cannot. V1 should document supported patterns for Mapbox GL JS, MapLibre, and PMTiles.

If a common browser tile path cannot send `Authorization`, product can evaluate a publishable-key query parameter later. Do not add query-string keys preemptively.

---

## 13. Rollout Plan

### Phase 0 — PRD Approval

- Product and engineering review this document.
- Confirm strict 403 vs anonymous fallback for invalid publishable origins.
- Confirm exact-only vs wildcard origin support in V1.
- Confirm whether publishable keys are one-time reveal or re-copyable.
- Confirm endpoint eligibility list, especially `POST /api/v1/utilities/resolve`.

### Phase 1 — Data Model and Key Parser

- Add key type to `api_keys`.
- Add `api_key_allowed_origins`.
- Add origin dimensions to usage events.
- Implement typed token parsing for `cg_pk_*` and `cg_sk_*`.
- Preserve legacy `cg_*` support.
- Add redaction tests.

### Phase 2 — Enforcement Middleware

- Implement publishable-key origin enforcement for public-read routes.
- Keep public unauthenticated CORS permissive.
- Add route classification metadata.
- Add standard error responses.
- Add rate-limit bucket handling and invalid-origin telemetry.
- Verify CDN/cache behavior.

### Phase 3 — Developer Dashboard

- Key creation UI with publishable vs secret choice.
- Origin allowlist management.
- Usage breakdown by key/origin/endpoint.
- Revoke/rotate flows.
- Docs and examples.

### Phase 4 — Operational Hardening

- Admin search and revoke tools.
- Alerts for invalid-origin spikes and quota exhaustion.
- Secret-scanning integration.
- Optional bulk-tier request workflow for publishable keys.

---

## 14. Documentation Requirements

Add or update developer documentation with:

- "Publishable vs secret keys" overview.
- Browser quickstart.
- Server quickstart.
- Allowed origin setup.
- Local development setup.
- Error code reference.
- Rate-limit explanation.
- Mapbox GL JS / MapLibre examples if tiles are supported with headers.
- Next.js environment variable safety example:

```env
# Browser-safe
NEXT_PUBLIC_COMMONGRID_PUBLISHABLE_KEY=cg_pk_...

# Server-only; never expose with NEXT_PUBLIC_
COMMONGRID_SECRET_KEY=cg_sk_...
```

Documentation should explicitly say:

- `cg_pk_*` is safe to publish but still should be restricted to your origins.
- `cg_sk_*` is a secret and must never be published.
- If you see `ORIGIN_NOT_ALLOWED`, add the exact browser origin shown in the error or remove the key to use anonymous access.
- If you are making server-side requests, use a secret key.

---

## 15. Acceptance Criteria

Implementation is ready when all of the following are true:

### Product

- Developers can create a publishable key and add allowed origins.
- Developers can create a secret key and see clear safety warnings.
- Dashboard clearly distinguishes `cg_pk_*` and `cg_sk_*`.
- Publishable-key docs include browser, localhost, and error examples.
- Secret-key docs include server-only examples and leak warnings.

### API Behavior

- Public endpoints remain callable anonymously from browsers with permissive CORS.
- Valid `cg_pk_*` + allowed `Origin` receives registered/bulk quota.
- Valid `cg_pk_*` + missing `Origin` returns 403 `PUBLISHABLE_KEY_ORIGIN_REQUIRED`.
- Valid `cg_pk_*` + `Origin: null` returns 403.
- Valid `cg_pk_*` + disallowed origin returns 403 `ORIGIN_NOT_ALLOWED`.
- Valid `cg_pk_*` cannot call write/private routes.
- Valid `cg_sk_*` works server-side without origin.
- Legacy `cg_*` keys continue to work.
- OPTIONS preflight does not require auth and does not count against quota.
- Rate-limit headers are exposed to browser clients.
- Invalid-origin attempts do not consume the key owner's quota.

### Security

- Full API keys are never logged.
- Redaction covers `cg_pk_*`, `cg_sk_*`, and legacy `cg_*`.
- Publishable keys cannot accidentally gain write access through broad scopes.
- Origin canonicalization has unit tests for scheme, host, port, trailing slash, punycode, localhost, wildcard, `null`, and missing origin.
- Admins can revoke compromised keys.

### Observability

- Usage events record key type and origin status.
- Dashboard can show requests by key, origin, endpoint, and status code.
- Invalid-origin spikes are queryable.
- Support can diagnose a reported `request_id`.

### Caching

- Cached public response bodies do not leak another caller's rate-limit headers.
- Auth/rate-limit enforcement still happens for authenticated requests even when response bodies are cacheable.

---

## 16. Recommended Product Decisions

These are the decisions this PRD recommends for V1:

1. **Strict invalid-origin behavior:** return 403 when a `cg_pk_*` is presented from a disallowed/missing origin. Do not silently downgrade to anonymous, because silent fallback hides configuration mistakes and makes usage analytics misleading. Public anonymous access remains available when no key is sent.
2. **Exact origins first:** ship exact origin matching and localhost support before wildcard origins unless a launch customer needs wildcards immediately.
3. **Publishable keys are read-only:** no browser writes in V1, even if scopes are misconfigured.
4. **Authorization header only:** avoid query-string keys in V1; revisit only for tile clients that cannot send headers.
5. **One-time reveal for V1:** keep hash-only storage and rotation UX unless product strongly prefers Mapbox-style re-copyable public tokens.
6. **Classify resolver as public read:** allow `POST /api/v1/utilities/resolve` for publishable keys if abuse/rate limits are in place, because browser utility lookup is broadly useful.

---

## 17. Open Questions for Review

1. Should wildcard subdomain origins ship in V1 or Phase 2?
2. Should publishable keys be re-copyable in the dashboard, or one-time reveal like secret keys?
3. Should non-localhost `http://` origins be allowed with a warning, or rejected entirely?
4. Should `POST /api/v1/utilities/resolve` be publishable-key eligible at launch?
5. Do tile/PMTiles clients require query-string publishable keys, or can all supported examples use headers?
6. What usage threshold should trigger bulk-tier eligibility for publishable keys?
7. Should invalid-origin attempts notify key owners immediately, or only after a threshold?

---

## 18. Future Extensions

Potential follow-ups after V1:

- Organization-owned keys and shared dashboards.
- Re-copyable publishable tokens via encrypted storage or signed-token reconstruction.
- Wildcard origins with public-suffix-list validation.
- Key-specific endpoint restrictions beyond scopes.
- Webhook notifications for key abuse and rate-limit warnings.
- Native mobile app restrictions, if there is real demand.
- Query-string publishable tokens for tile clients that cannot send headers.
- Public status page integration showing API-key auth and rate-limit health.

---

## 19. Covenant Check

This design passes the CommonGrid open-source covenant:

- It is useful to any developer building a browser app on public grid data.
- It does not create Texture-only routes, roles, schemas, or privileges.
- It uses the same public developer model for all consumers.
- It improves transparency through documented schemas, errors, limits, and dashboard visibility.
- It keeps private/credentialed user workflows separate from public CommonGrid data access.

CommonGrid remains the open registry. Publishable keys simply give browser-based mapmakers a safe compass to navigate it with.
