// The migrations alone, for DB test suites building a throwaway database's
// tables (`createTestDb` + `runMigrations`). Boot runs `applySchemaLayer`.
export { runMigrations } from "../internal/runner";
