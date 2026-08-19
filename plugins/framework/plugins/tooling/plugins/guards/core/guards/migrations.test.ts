import { describe, expect, test } from "bun:test";
import { createContext } from "../context";
import type { Verdict } from "../types";
import { migrationsGuard } from "./migrations";

// A deliberately fake repo root (not under /Users — see paths:no-hardcoded-paths).
const REPO = "/r/repo";
const DATA = "plugins/tasks/plugins/tasks-core/server/migrations/data";

const blocks = (command: string, cwd = REPO) =>
  (migrationsGuard.check({ command }, createContext(cwd)) as Verdict).kind ===
  "deny";

describe("migrations guard", () => {
  describe("blocks a hand-deletion of migration files", () => {
    test("a single file by relative path", () => {
      expect(blocks(`rm ${DATA}/0007_add_column.sql`)).toBe(true);
    });

    test("a single file by absolute path", () => {
      expect(blocks(`rm ${REPO}/${DATA}/0007_add_column.sql`)).toBe(true);
    });

    test("a glob under the directory", () => {
      expect(blocks(`rm -f ${DATA}/0007_*.sql`)).toBe(true);
    });

    test("the directory itself — the trailing-slash substring test missed this", () => {
      expect(blocks(`rm -rf ${DATA}`)).toBe(true);
    });

    test("a relative path reached through a cd, which only resolving finds", () => {
      // The old substring test matched the literal arg, so it happened to catch
      // this too; the operand parse catches it because the path RESOLVES there.
      expect(
        blocks(
          `cd plugins/tasks/plugins/tasks-core/server && rm -rf migrations/data`,
        ),
      ).toBe(true);
    });

    test("an operand hidden behind a `--` terminator", () => {
      expect(blocks(`rm -rf -- ${DATA}`)).toBe(true);
    });
  });

  describe("stays inert where it should", () => {
    test("deleting something else entirely", () => {
      expect(blocks(`rm -rf node_modules`)).toBe(false);
    });

    test("a path that merely mentions migrations", () => {
      expect(blocks(`rm docs/migrations-notes.md`)).toBe(false);
    });

    test("reading the directory rather than deleting it", () => {
      expect(blocks(`ls ${DATA}`)).toBe(false);
    });

    test("a commit message that talks about the directory", () => {
      // The message is `-m`'s value, not an operand — and this guard only ever
      // looks at `rm` anyway.
      expect(blocks(`git commit -m "drop ${DATA}/0007.sql"`)).toBe(false);
    });
  });
});
