// `core/` here is pure: it reaches no node builtin and no browser global, so a
// consumer that only wants the mitigation predicate pays nothing for it.
//
// Nothing here imports `playwright` — not even lazily. Chromium itself is an
// on-demand dependency declared in `../deps` (`chromium`), installed by the
// infra/deps engine off the event loop, never from here.

export { detectBotMitigation } from "./internal/bot-mitigation";
export type {
  BotMitigation,
  HeaderReader,
  HeaderSource,
} from "./internal/bot-mitigation";
