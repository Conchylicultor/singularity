import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { RELEASE_LOG_CHANNEL } from "../../core/targets";

// Single owner of the "release" log channel. `Log.channel` throws on a duplicate
// id, so the channel is created exactly once here and shared by every release
// server module (run-release, preview-manager, …). Persisted → logs/release.jsonl,
// which the per-run logs endpoint reads as the fallback after the live stream ends.
export const releaseLog = Log.channel(RELEASE_LOG_CHANNEL, { persist: true });
