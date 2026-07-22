// `core/` here means RUNTIME-NEUTRAL NODE, not web-safe: this barrel reaches
// `node:fs`. The argv/prefix demotion helpers live in `core/` so runtimes whose
// `core → core` isolation puts `server/` out of reach (the CLI check runner,
// infra/spawn's `core/`) can still compose them. `boostInteractiveQos` stays
// server-only (bun:ffi). This plugin must NEVER be imported from `web/`.

export { backgroundArgv, backgroundPrefix } from "./internal/background";
