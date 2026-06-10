import { Log } from "@plugins/primitives/plugins/log-channels/server";

// Single owner of the "build" log channel. `Log.channel` throws on a duplicate
// id, so the channel is created exactly once here and shared by every build
// server module (run-build, frontend-hash-resource, …).
export const buildLog = Log.channel("build");
