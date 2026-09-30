// The python installer kind of infra/deps, host-only like the engine: a
// declaration (`pythonEnv`, in a feature's `deps/index.ts`) and the runner
// (`runPython`, which takes a `Ready`). The `uv` updater is the server barrel.
export { pythonEnv } from "./internal/python-env";
export type { PythonEnvSource } from "./internal/python-env";
export { runPython, PythonEntryError } from "./internal/run-python";
export type { RunPythonOptions } from "./internal/run-python";
