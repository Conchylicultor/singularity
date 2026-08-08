// `core/` here means RUNTIME-NEUTRAL NODE, not web-safe: `ensureChromium`
// reaches `node:fs` / `node:child_process`. This plugin must NEVER be imported
// from `web/`.
//
// Nothing in this barrel imports `playwright` at module eval — the one function
// that needs it loads it lazily — so a consumer that only wants the mitigation
// predicate does not pay ~3 s of Playwright module evaluation at backend boot.

export { ensureChromium } from "./internal/ensure-chromium";
export { detectBotMitigation } from "./internal/bot-mitigation";
export type {
  BotMitigation,
  HeaderReader,
  HeaderSource,
} from "./internal/bot-mitigation";
