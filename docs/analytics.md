# Product analytics

CommonGrid uses GA4 for acquisition and activation reporting and PostHog for identified product analysis. Both are optional and use the existing `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_POSTHOG_KEY`, and `NEXT_PUBLIC_POSTHOG_HOST` deployment settings. No new secret or infrastructure is required.

## Shared event contract

- `sign_up`: Clerk reports a completed signup with a created user and session, and that session becomes active. A root-level Clerk listener covers the embedded signup page, modal, and OAuth callback. A returning login alone does not qualify. Signup completions that never reach the browser are not counted.
- `api_key_created`: the browser receives HTTP 201 and a resource ID from `POST /api/v1/developer/keys`. The API key, key name, and application details are never event parameters.
- `contribution_submitted`: the browser receives HTTP 201 and a contribution ID from `POST /api/v1/contributions`. Includes entity creation, updates, and deletion requests, whether pending or auto-approved. Does not imply moderation approval. PATCH/resubmission is not a new conversion. Covers inline edits, full-edit panels, delete dialogs, and add-entity pages.
- `registry_search_result_selected` and `registry_browse_category_selected`: both destinations receive only the entity category, not search text or result names.
- `page_view` (GA4) / `$pageview` (PostHog): one explicit event per pathname transition. Query-only changes do not create pageviews.

`lib/analytics.ts` owns the contract. `conversionFetch` decorates only the explicit creation call sites, not global fetch. The caller retains its original response and error handling. There are no server-side copies of these conversions, so browser and webhook events cannot double count each other. External API-client activity is not included in this browser funnel.

Conversion deduplication uses event name plus returned resource ID in localStorage, with a memory fallback if storage is unavailable. IDs are not sent as event properties. Deduplication is best-effort on one browser, not an exactly-once delivery guarantee: clearing storage, simultaneous tabs, blocked vendors, page closure, or connectivity failures can lose or duplicate telemetry. No network-delivery acknowledgement is implied by a dedupe marker.

## Identity and privacy

- GA4 receives only the opaque Clerk user ID as `user_id`, cleared to `null` on sign-out. Email and name are **not** GA4 event parameters or user properties. Google signals are disabled in the client configuration.
- PostHog retains the existing signed-in email/name enrichment. Anonymous startup does not reset its visitor ID. An identified account changing or signing out does reset it, including after a reload.
- Explicit GA events use URLs without query strings/fragments and a constant page title. Authentication paths are reduced to `/sign-in` or `/sign-up`. PostHog's before-send filter also strips URL query strings/fragments from current/referrer and initial person properties.
- GA receives allowlisted `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, and `utm_id` values as campaign configuration before the first pageview. Only bounded simple text is accepted. Arbitrary query parameters, click IDs, and authentication tokens are not forwarded. Do not place personal information in campaign labels.
- PostHog automatic DOM capture, automatic pageviews/pageleave, and session recording are disabled; explicit events and feature flags remain available. This avoids capturing form values, free text, and the API-key reveal screen.
- This change does **not** introduce a consent-management platform or establish a legal basis for tracking. Existing configured analytics still load automatically. Deployments requiring opt-in must gate both SDK initialization and captures, including identity, behind their consent system before enabling analytics. Do not interpret URL filtering as a substitute for consent.

## GA4 property configuration (requires property access)

Before enabling reporting for these explicit pageviews:

1. Disable **Enhanced Measurement** on the web data stream, particularly browser-history pageviews, form interactions, and site search. Automatic collection can duplicate explicit pageviews or send raw URLs/form metadata outside this contract. `send_page_view: false` suppresses the config pageview, not all admin-enabled automatic events.
2. Mark `sign_up`, `api_key_created`, and `contribution_submitted` as **key events**. Select the counting method deliberately: signup is once per account in this browser; activation events count each newly created resource. Do not mark every pageview as a key event.
3. Confirm retention, internal-traffic exclusion, data filters, and Google user-provided-data settings with the property owner. This implementation does not enable user-provided-data collection or upload hashed emails.
4. Build the acquisition → signup → API-key/contribution funnel. Compare rates rather than expecting GA4 and PostHog totals to be identical; blockers and vendor attribution rules differ.

## Verification checklist

Automated regression tests cover the shared contract, failed/malformed responses, duplicate resources/reloads, blocked storage, anonymous/account transitions, and URL/PII filtering. They do not prove live vendor delivery.

Use a permitted test account and disposable test resources on a preview deployment (do not make ad-hoc production data writes):

1. In a mobile viewport, enter via an approved UTM-tagged URL. Open and dismiss the signup modal, then complete signup in both modal and page flows, including OAuth. Each completed new account should yield one `sign_up`; ordinary login and reload should yield none.
2. Compare the anonymous PostHog distinct ID before and after an anonymous reload. It should be stable; signup should connect the anonymous journey to the new person. Verify a sign-out/account switch no longer attributes events to the prior account.
3. Create one API key, submit an inline edit, full edit, new entity, and deletion request. Confirm one corresponding event for each 201; validation errors and PATCH updates should not add conversions. Revoke/delete test resources through supported UI workflows.
4. Navigate between routes and use back/forward. Inspect GA DebugView and PostHog live events for one pageview per pathname transition. Confirm GA user_id is opaque and cleared after logout.
5. Inspect browser analytics requests for email/name, API-key material, search text, query strings, and callback tokens. Email/name should appear only in intended PostHog identify calls, never GA.
6. Verify the original campaign survives signup in GA4 and the anonymous-to-person linkage in PostHog. Verify key-event reporting after processing. This requires actual property access; source inspection and a healthy production response are not proof.

Roll back through a reviewed code revert if needed; no database migration is involved.
