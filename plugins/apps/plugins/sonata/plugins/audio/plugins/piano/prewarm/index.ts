import { LAYERS } from "smplr";
import { defineAssetMirrorPrewarm } from "@plugins/infra/plugins/asset-mirror/core";
import { PIANO_MIRROR_ID, PIANO_REMOTE_BASE } from "../shared/mirror";

/**
 * Prewarm seed for the splendid-grand-piano mirror — the files the release
 * pipeline bakes into the bundle so the default Acoustic Piano sounds offline on
 * a cold start (before any online warm-up has populated the lazy cache).
 *
 * The sample base names are derived from smplr's OWN `SplendidGrandPiano`
 * `LAYERS` manifest — the exact set its loader fetches. smplr's `collectSampleNames`
 * dedupes `region.sample` across every velocity layer and fetches each as
 * `<baseUrl>/<name>.<format>`; we reproduce that dedupe here. Importing `LAYERS`
 * (instead of copying a frozen name list) makes this the single source of truth:
 * a smplr sample-set change flows through automatically and can never drift from
 * what the runtime requests. (Verified at runtime: the captured
 * `/api/asset-mirror/splendid-grand-piano/*.ogg` request set is exactly this
 * `.ogg` half — see the prewarm research doc's verification step.)
 */
const SAMPLE_NAMES = [
  ...new Set(LAYERS.flatMap((layer) => layer.samples.map((s) => String(s[1])))),
];

export default defineAssetMirrorPrewarm({
  id: PIANO_MIRROR_ID,
  remoteBaseUrl: PIANO_REMOTE_BASE,
  // smplr negotiates format per browser: `.ogg` on Chromium/Firefox, `.m4a` on
  // Safari/WebKit (the Tauri webview). Seed BOTH extensions so offline audio
  // works on every release target — the samples are small.
  files: SAMPLE_NAMES.flatMap((name) => [`${name}.ogg`, `${name}.m4a`]),
});
