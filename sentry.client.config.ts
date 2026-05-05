import * as Sentry from "@sentry/nextjs";

// Match crawlers / headless bots that are not actually running modern JS but
// spoof a browser UA. We get a steady trickle of `SyntaxError: Unexpected
// token '('` events from these (COMMONGRID-9, 2026-05-05) because their JS
// parsers choke on modern bundles that real browsers handle fine.
const BOT_UA_PATTERNS: RegExp[] = [
  /bot|crawler|spider|slurp|bingbot|googlebot|duckduckbot|baiduspider|yandex/i,
  /headlesschrome|puppeteer|playwright|phantomjs|htmlunit|selenium/i,
  /ahrefs|semrush|mj12bot|dotbot|seznambot|pingdom|uptimerobot|gtmetrix/i,
  /facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot|telegrambot/i,
  /^$/, // empty UA
];

function looksLikeBot(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // Explicit bot markers.
  if (BOT_UA_PATTERNS.some((re) => re.test(ua))) return true;
  // Real Chrome on Linux is rare; the `Chrome/NNN.0.0.0` minor pattern on
  // `X11; Linux x86_64` with no additional platform data is the common
  // fingerprint for monitoring services and homegrown scrapers.
  if (
    /X11;\s+Linux\s+x86_64/.test(ua) &&
    /Chrome\/\d+\.0\.0\.0/.test(ua) &&
    !/Edg\/|OPR\/|Brave/.test(ua) &&
    typeof (navigator as { webdriver?: boolean }).webdriver === "boolean" &&
    (navigator as { webdriver?: boolean }).webdriver === true
  ) {
    return true;
  }
  return false;
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 100% of errors in production
  sampleRate: 1.0,

  // Performance monitoring — sample 20% of transactions
  tracesSampleRate: 0.2,

  // Replay configuration for debugging production issues
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration(),
    Sentry.browserTracingIntegration(),
  ],

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",

  // Filter out noisy errors
  ignoreErrors: [
    // Browser extension noise
    "ResizeObserver loop",
    // Lazy chunk loading (transient network issues)
    /Loading chunk \d+ failed/,
    // Generic parse errors from bots / old browsers that fail to parse
    // modern bundles (Clerk CDN, our Next.js chunks). Real users on
    // evergreen browsers do not hit these.
    /SyntaxError:?\s+Unexpected token/,
  ],

  // Ignore errors that originate in 3rd-party scripts we do not ship /
  // version-control ourselves. Parse errors in Clerk's CDN bundle are not
  // actionable on our side and almost always indicate a non-browser client.
  denyUrls: [
    /clerk\.[a-z0-9.-]+\/npm\/@clerk\//i,
    /clerk-telemetry\.com/i,
  ],

  beforeSend(event) {
    // Drop events from clients that look like crawlers / scrapers.
    if (looksLikeBot()) return null;
    return event;
  },
});
