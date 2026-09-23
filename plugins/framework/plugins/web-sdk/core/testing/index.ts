// Test-only reset of the module-level deferred-load state, so each suite
// starts from a fresh boot.
export { resetDeferredLoadStateForTests } from "../deferred-load-store";
