import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * uv's package cache (`UV_CACHE_DIR`): downloaded wheels and built
 * distributions, shared by every Python env the deps python kind installs.
 * Reclaimable at any time — the next `uv sync` refetches what it needs.
 */
export const uvCacheDir = defineDataDir({
  kind: "cache",
  name: "uv",
  owner: "infra/deps/python",
  description:
    "uv's package cache (wheels, built distributions) for the Python envs infra/deps installs",
  reclaim: { kind: "safe" },
});

/**
 * The CPython builds uv downloads (`UV_PYTHON_INSTALL_DIR`) — the macOS system
 * Python is never touched. Each env's `bin/python` links into here, so
 * reclaiming it leaves those envs broken; the python kind's `isIntact` sees the
 * dangling link and the next `ensureDep` reinstalls (uv refetches the Python).
 */
export const uvPythonDir = defineDataDir({
  kind: "cache",
  name: "uv-python",
  owner: "infra/deps/python",
  description:
    "CPython builds uv downloaded for the Python envs infra/deps installs (never the system Python)",
  reclaim: { kind: "safe" },
});

export default [uvCacheDir, uvPythonDir];
