// `core/` here is pure: it reaches no node builtin and no browser global, so a
// consumer that only wants the mitigation predicate pays nothing for it.
//
// Nothing here imports `playwright` — not even lazily. The chromium binary is
// provisioned at INSTALL time (`../provision`), never from a runtime path, so
// the function that downloads it is not reachable from `web/`, `server/` or
// `core/` at all; `boundary-config.ts` enforces that.

export { detectBotMitigation } from "./internal/bot-mitigation";
export type {
  BotMitigation,
  HeaderReader,
  HeaderSource,
} from "./internal/bot-mitigation";
