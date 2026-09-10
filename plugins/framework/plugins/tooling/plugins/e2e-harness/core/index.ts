// The runtime-neutral half of the e2e harness: what OTHER runtimes need to know
// about e2e scripts without running one. Today that is the path convention —
// the `run` command reads it to decide whether a script is an `e2e` op. The
// harness itself (browser, target, report) stays in `e2e/`, which only e2e
// scripts import.
export { isE2eScriptPath } from "./internal/e2e-path";
