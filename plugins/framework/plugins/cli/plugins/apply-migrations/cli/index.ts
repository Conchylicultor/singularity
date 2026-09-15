import { defineCliCommand } from "@plugins/framework/plugins/cli/core";

/**
 * The fresh-clone seam. A checkout that has never built has no 'singularity'
 * DB, and the server is what normally applies migrations — so mise's `setup`
 * runs this once to seed the base DB before the first build. Nothing else
 * should: the server applies migrations itself on boot.
 *
 * Everything it needs — `pg`, `drizzle-orm`, the database barrels — sits behind
 * the declaration's lazy `import("./run")`, so the other commands no longer pay
 * for a Postgres driver they never touch.
 */
export default defineCliCommand<[], { namespace?: string }>({
  name: "apply-migrations",
  description:
    "Apply pending SQL migrations to one namespace's database — by default the " +
    "one this checkout owns. Used by the fresh-clone bootstrap (mise `setup`) to " +
    "seed the base 'singularity' DB before the first build; the server otherwise " +
    "applies migrations itself on boot.",
  options: [
    {
      // OPTIONAL, unlike `supervised-exec`'s, and the default is what makes it
      // so: this is a CLI process acting on a checkout, so the checkout's own
      // namespace is the right answer and can be minted from git. The flag is
      // for the release launcher, which seeds a namespace that is not a
      // checkout at all.
      flags: "--namespace <ns>",
      description:
        "Namespace whose database to migrate (default: the namespace this checkout owns)",
    },
  ],
  run: () => import("./run"),
});
