import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { UpdaterDeclare } from "@plugins/infra/plugins/deps/plugins/updates/server";
import { uvUpdater } from "./internal/uv-updater";

export { pythonEnv } from "./internal/python-env";
export type { PythonEnvSource } from "./internal/python-env";
export { runPython, PythonEntryError } from "./internal/run-python";
export type { RunPythonOptions } from "./internal/run-python";

export default {
  description:
    "The python installer kind of infra/deps: pythonEnv({ project }) declares a dependency on one uv project (a plugin's `python/` folder) — identity = hash of pyproject.toml + uv.lock + .python-version + the uv version, installed with `uv sync --frozen` into its own env with a uv-downloaded CPython (never the system Python) — and runPython(ready, { module, input, output }) runs one of its modules with JSON in and one JSON document out. Contributes the `uv` updater, which moves every python/ project's uv.lock under a 3-day release cooldown.",
  contributions: [UpdaterDeclare({ updater: uvUpdater })],
} satisfies ServerPluginDefinition;
