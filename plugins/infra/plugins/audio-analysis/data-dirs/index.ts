import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * Beat features per YouTube video, host-wide: `v<N>/<settingsKey>/<videoId>.json` (written
 * by rename after validation — its presence is what "ready" means), plus
 * `<videoId>.running.json` while an analysis holds `<videoId>.lock` and
 * `<videoId>.failed.json` after one threw. The version in the path makes a
 * bump re-analyse everything.
 *
 * `cache`, and genuinely so: any entry is recomputed from the video on demand.
 * Every worktree on the machine shares one analysis.
 */
export const beatFeaturesCacheDir = defineDataDir({
  kind: "cache",
  name: "beat-features",
  owner: "infra/audio-analysis",
  description:
    "Beat features (beats, downbeats, chroma) per YouTube video, analysis version and settings; recomputed on demand",
  reclaim: { kind: "safe" },
});

/**
 * Model checkpoints the extractors download on first use (`TORCH_HOME`): the
 * Beat This! `small0` (≈8 MB) and `final0` (≈80 MB) checkpoints, each
 * sha256-pinned in the extractor and downloaded when first configured.
 */
export const audioModelsCacheDir = defineDataDir({
  kind: "cache",
  name: "audio-models",
  owner: "infra/audio-analysis",
  description:
    "Audio-analysis model checkpoints (Beat This!), downloaded and sha256-checked on first use",
  reclaim: { kind: "safe" },
});

export default [beatFeaturesCacheDir, audioModelsCacheDir];
