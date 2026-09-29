// Test helpers other suites reuse. Only test code (and `check/`) may import a
// testing barrel, so this mint of an ExecContext cannot reach shipping code.
export { cliExecContext as execContextForTests } from "../internal/exec-context";
