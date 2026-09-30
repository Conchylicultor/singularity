// Test helpers other suites reuse. Only test code (and `check/`) may import a
// testing barrel, so this mint of an ExecContext cannot reach shipping code.
// Its admission runs the body at once: a test takes no host grant.
export { execContextForTests } from "./exec-context";
