/**
 * The name grammar for a throwaway test database, as ONE module that both mints
 * and reads it.
 *
 * WHY THE NAME CARRIES THE FACTS. `createTestDb` drops its database in the
 * suite's `afterAll`, which reclaims it on every path the process survives — and
 * on no other. A test run that is killed (Ctrl+C, a crash, an OOM, a wedged
 * suite someone SIGKILLs) leaves a fully-migrated database on the shared
 * cluster, and until this module existed nothing on the host could tell such a
 * database from a real namespace, so nothing ever reclaimed one: five killed
 * runs between 2026-08-03 and 2026-08-19 left seven of them (~77 MB), still
 * sitting there a month later when a human went looking.
 *
 * A hook is not a lifetime. The lifetime has to be legible to a LATER process
 * that never saw the mint, which means it has to be written down where that
 * process is already looking — and the only thing Postgres carries for a
 * database, with no catalog of our own, is its name. So the name states the two
 * things a sweeper needs: that this database is disposable (the suffix), and
 * when it was minted (the timestamp). `parseTestDbName` is the only reader, this
 * is the only writer, and `scratch-name.test.ts` pins the round trip — so the
 * two spellings cannot drift the way a producer and a hand-written sweeper regex
 * would.
 *
 * A separate `mintedAt` rather than trusting "no active connections" alone:
 * `createTestDb` calls `ensureDatabase` and only then opens its pool, so a
 * freshly minted database is briefly connection-less and would otherwise be
 * reclaimable out from under the run that just created it.
 */

/**
 * What makes a database disposable. Every name minted here ends with it, and it
 * is the whole of the sweeper's admission test — a database that does not end
 * with this suffix is never a candidate, whatever else its name looks like.
 */
export const TEST_DB_SUFFIX = "__testdb";

/**
 * Postgres truncates `datname` at 63 bytes SILENTLY, so a longer name addresses
 * a database other than the one it spells — the mint asserts rather than letting
 * a long prefix produce a name that parses back as something else (or, worse,
 * collides with another suite's truncated name).
 */
const MAX_DATNAME_BYTES = 63;

// `TextEncoder`, not `Buffer`: this is a `core` module, so it must stay
// runtime-neutral even though today only the server and a job import it.
const byteLength = (s: string): number => new TextEncoder().encode(s).length;

/** What a minted name says. */
export interface TestDbName {
  /** The suite's own label, e.g. `page_forest_test`. */
  prefix: string;
  /** The pid of the test process that minted it — disambiguates parallel runs. */
  pid: number;
  /** Epoch ms at mint, as encoded in the name. */
  mintedAt: number;
}

/**
 * `<prefix>_<pid>_<base36 mintedAt>__testdb`.
 *
 * The prefix is constrained to the lowercase/underscore alphabet that
 * `assertSafeName`'s internal-database arm accepts, so an unsafe prefix fails
 * HERE — at the one call that composes it — rather than at the `CREATE DATABASE`
 * that interpolates it.
 */
export function mintTestDbName(
  prefix: string,
  pid: number,
  mintedAt: number,
): string {
  if (!/^[a-z][a-z0-9_]*$/.test(prefix)) {
    throw new Error(
      `Invalid test-database prefix "${prefix}": must start with a lowercase ` +
        `letter and contain only lowercase letters, digits and underscores.`,
    );
  }
  const name = `${prefix}_${pid}_${mintedAt.toString(36)}${TEST_DB_SUFFIX}`;
  if (byteLength(name) > MAX_DATNAME_BYTES) {
    throw new Error(
      `Test-database name "${name}" is ${byteLength(name)} bytes; ` +
        `Postgres truncates datname at ${MAX_DATNAME_BYTES} and would address a ` +
        `different database. Shorten the prefix.`,
    );
  }
  return name;
}

/**
 * The inverse. `null` means "not a name this module minted" — a legitimate
 * answer about someone else's database, not a swallowed failure: every real
 * namespace on the cluster takes this branch.
 *
 * A name that ends with the suffix but does not parse is NOT tolerated. The
 * suffix is minted nowhere else, so such a name is a torn mint or a hand-made
 * lookalike, and silently declining to reclaim it is how the leak this module
 * exists to close comes back.
 */
export function parseTestDbName(name: string): TestDbName | null {
  if (!name.endsWith(TEST_DB_SUFFIX)) return null;
  const body = name.slice(0, -TEST_DB_SUFFIX.length);
  const m = /^([a-z][a-z0-9_]*)_(\d+)_([0-9a-z]+)$/.exec(body);
  if (!m) {
    throw new Error(
      `Database "${name}" carries the ${TEST_DB_SUFFIX} suffix but does not ` +
        `match the minted grammar <prefix>_<pid>_<base36>. Nothing else mints ` +
        `that suffix, so its provenance is unknown and it must not be reclaimed.`,
    );
  }
  const mintedAt = parseInt(m[3]!, 36);
  if (!Number.isFinite(mintedAt)) {
    throw new Error(`Database "${name}" has an unreadable mint timestamp.`);
  }
  return { prefix: m[1]!, pid: parseInt(m[2]!, 10), mintedAt };
}

/**
 * How long a minted database is protected from the sweep regardless of whether
 * anything is connected to it. Generous on purpose: the cost of waiting is a few
 * idle megabytes, and the cost of being wrong is deleting the database out from
 * under a running suite.
 */
export const TEST_DB_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
