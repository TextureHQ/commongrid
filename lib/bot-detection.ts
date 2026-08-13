/**
 * Crawler / automation detection for error-reporting filters.
 *
 * Extracted from the Sentry client config so the behaviour is unit-testable.
 *
 * HISTORY (2026-08-13): the previous inline version also treated any
 * `X11; Linux x86_64` + `Chrome/NNN.0.0.0` user agent as a bot on the theory
 * that "real Chrome on Linux is rare". It is not rare, and that rule — plus a
 * blanket `SyntaxError: Unexpected token` ignore pattern — silently dropped 447
 * of 466 error events over a 90-day window. The project appeared to have zero
 * errors while genuine bugs went unreported.
 *
 * THE RULE: only filter clients that *self-identify* as a bot or as headless
 * automation. Never infer "bot" from platform, Chrome version shape, or any
 * other fingerprint that real users share. A false negative costs one noisy
 * event; a false positive costs total blindness.
 */

/** Explicit, self-identifying crawler and automation markers. */
const BOT_UA_PATTERNS: RegExp[] = [
  // `\b` after "bot" so "Robotics" and similar product tokens do not match,
  // while Googlebot/bingbot/AhrefsBot/SemrushBot etc. still do.
  /bot\b|bot\/|crawler|spider|slurp/i,
  // Headless browsers and automation drivers.
  /headlesschrome|puppeteer|playwright|phantomjs|htmlunit|selenium|webdriver/i,
  // SEO / uptime / performance scanners.
  /ahrefs|semrush|mj12bot|dotbot|seznambot|pingdom|uptimerobot|gtmetrix|lighthouse/i,
  // Link unfurlers and social preview fetchers.
  /facebookexternalhit|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|embedly/i,
];

/**
 * Return true when the user-agent string identifies a bot, crawler, or headless
 * automation client whose errors are not actionable.
 *
 * An empty user agent is treated as a bot: every real browser sends one.
 */
export function isBotUserAgent(userAgent: string): boolean {
  if (userAgent.trim() === "") return true;
  return BOT_UA_PATTERNS.some((pattern) => pattern.test(userAgent));
}

/** Browser-environment convenience wrapper around {@link isBotUserAgent}. */
export function currentClientIsBot(): boolean {
  if (typeof navigator === "undefined") return false;
  return isBotUserAgent(navigator.userAgent ?? "");
}
