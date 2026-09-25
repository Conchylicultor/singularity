// Creating the change-feed's changelog table in a suite's own database, without
// rebuilding every trigger.
export { ensureChangelogTable } from "../internal/triggers";
