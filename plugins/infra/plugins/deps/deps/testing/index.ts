// Test helpers other suites reuse (only test code and `check/` may import a
// testing barrel). A runner's tests need a `Ready` without running a real
// install; shipping code gets one only from `ensureDep`.
export { mintReady as readyForTests } from "../internal/dep";
