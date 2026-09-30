import { defineDep } from "@plugins/infra/plugins/deps/server";
import { pythonEnv } from "@plugins/infra/plugins/deps/plugins/python/server";

/**
 * The audio-analysis Python env: torch, Beat This!, librosa, PyAV, numpy
 * (`../../python`). ≈950 MB installed, paid once per machine on the first
 * analysis; the Beat This! checkpoint (≈80 MB) lands separately in
 * `cache/audio-models` on its first run.
 */
export const audioPythonDep = defineDep({
  id: "audio-python",
  owner: "infra/audio-analysis",
  description:
    "Python audio analysis: Beat This! beat tracking, librosa chroma, PyAV decoding (torch)",
  sizeHint: "≈950 MB",
  source: pythonEnv({ project: "plugins/infra/plugins/audio-analysis/python" }),
});
