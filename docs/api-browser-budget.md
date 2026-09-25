# Browser read budget

Ordinary same-origin browsing uses the same public `/api/v1/*` endpoints as other consumers, without a privileged browser API key. To avoid exhausting the small anonymous API allowance while loading counts, lists and details, anonymous browser reads have a separate **5,000 requests/hour per IP**, capped at **120 requests/minute per IP**.

Requests qualify only when all of these apply:

- Method is GET or HEAD, under `/api/v1/`, excluding bulk paths.
- Fetch Metadata reports `Sec-Fetch-Site: same-origin`, `Sec-Fetch-Mode: cors` or `same-origin`, and `Sec-Fetch-Dest: empty`.
- Origin or Referer is present and matches the request's exact origin. If both are present, both must match.
- There is no validated API key. Supplied invalid credentials still fail authentication.

This is **traffic classification, not authentication or a bot defense**. Non-browser scripts can forge every header. They can obtain the browser allowance but cannot bypass its per-IP hourly and burst limits, gain write permissions, or obtain a registered/bulk identity. Do not use this classifier to authorize data access. The tradeoff is intentional: public read traffic gets a useful bounded allowance without introducing a new session issuer or secret immediately before launch.

Other requests retain the existing anonymous 60/hour, registered 5,000/hour, bulk 50,000/hour, and write 100/minute policies. The browser counters use a separate Redis namespace; browsing does not consume the anonymous API quota. This does mean a caller can consume both separate budgets. API keys keep their existing budgets even when sent by the site.

Limits are shared by visitors behind the same public IP, not per browser session. Privacy tools stripping request metadata fall back to the anonymous quota. Clients receive `X-RateLimit-Tier: browser` with the actual hourly or burst limit, and HTTP 429 plus `Retry-After` when exhausted. Usage analytics still record these unauthenticated requests as anonymous; no authentication/schema semantics change.

## Operational verification

- Configure the existing Upstash Redis environment variables for distributed enforcement. With no Redis, the existing memory fallback remains per-instance only. This change introduces no new secrets or infrastructure.
- On a preview deployment, use an incognito desktop and mobile browser to navigate homepage → Explore → search/filter → detail → back. Inspect count/list response headers for the browser tier and check that ordinary navigation does not return 429.
- Verify requests without browser metadata retain the anonymous tier; invalid API keys return 401 even with browser metadata. Verify controlled burst exhaustion returns 429 before running any production traffic test.
- Do not trust client-supplied forwarding headers unless the deployment's trusted proxy sanitizes them. IP identification is unchanged by this patch.
- Monitor Redis failures, 429 rates and API latency at launch. A revert restores the previous quotas without a data migration.

This patch does not consolidate homepage count requests, tune expensive spatial queries, implement per-visitor sessions, or prove load capacity. Those remain separate optimizations and verification work.
