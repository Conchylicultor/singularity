import { toolchainPin } from "@plugins/infra/plugins/paths/core";

// ── Pin this backend's toolchain before anything can spawn ───────────────────
//
// Imported right after `./declare-namespace`, ahead of every plugin: a mise tool
// this process (or anything it spawns) runs resolves THIS checkout's locked
// release whatever cwd it runs in, instead of an unlocked system copy or
// `mise ERROR No version is set for shim`. See `toolchainPin` (paths/core).
//
// Here and not in the shared boot sequence: `exec` processes are spawned by a
// backend and inherit this from its environment, and `bin/` is the composition
// root that may reach `paths` without closing a plugin cycle.
Object.assign(process.env, toolchainPin());
