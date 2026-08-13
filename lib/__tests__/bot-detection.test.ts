/**
 * Regression tests for the client-side bot filter used by Sentry's `beforeSend`.
 *
 * Context (2026-08-13): the original heuristic in `sentry.client.config.ts`
 * treated any `X11; Linux x86_64` + `Chrome/NNN.0.0.0` user agent as a bot.
 * Combined with a blanket `SyntaxError: Unexpected token` ignore rule, this
 * dropped 447 of 466 error events over a 90-day window and made the project
 * look error-free while real bugs went unreported.
 *
 * The rule these tests enforce: only drop clients that *self-identify* as bots
 * or headless automation. Real browsers are never filtered, on any platform.
 */

import { describe, expect, it } from "vitest";
import { isBotUserAgent } from "../bot-detection";

const REAL_BROWSERS = [
  // Desktop Chrome on Linux — the UA the old heuristic wrongly rejected.
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  // Desktop Chrome on macOS.
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  // Desktop Chrome on Windows.
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  // Safari on macOS.
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
  // Firefox on Linux.
  "Mozilla/5.0 (X11; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0",
  // Mobile Safari on iOS.
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  // Chrome on Android.
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
  // Edge on Windows.
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
];

const BOTS = [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "Mozilla/5.0 (compatible; DuckDuckBot-Https/1.1; https://duckduckgo.com/duckduckbot)",
  "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
  "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
  "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/128.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Puppeteer",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Playwright",
  "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Pingdom.com_bot_version_1.4_(http://www.pingdom.com/)",
  "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)",
];

describe("isBotUserAgent", () => {
  it.each(REAL_BROWSERS)("does NOT filter real browser: %s", (ua) => {
    expect(isBotUserAgent(ua)).toBe(false);
  });

  it.each(BOTS)("filters bot/automation: %s", (ua) => {
    expect(isBotUserAgent(ua)).toBe(true);
  });

  it("treats an empty user agent as a bot", () => {
    expect(isBotUserAgent("")).toBe(true);
    expect(isBotUserAgent("   ")).toBe(true);
  });

  it("does not match the word 'robot' inside an unrelated product token", () => {
    // Guards against a naive /bot/ substring match. "Robotics" is not a crawler.
    expect(isBotUserAgent("Mozilla/5.0 RoboticsResearchBrowser/1.0")).toBe(false);
  });
});
