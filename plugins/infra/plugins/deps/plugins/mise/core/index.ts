// `core/` here means RUNTIME-NEUTRAL NODE, not web-safe: the updater spawns
// mise. It lives in `core/` so `./singularity toolchain upgrade` (the alias)
// runs it without booting a backend. It must NEVER be imported from `web/`.
export { miseUpdater } from "./internal/mise-updater";
