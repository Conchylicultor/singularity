// Replicates drizzle-kit's schema loader: it `require()`s each schema-glob file
// synchronously under Bun (`bun --bun`). A `.ts` file whose import graph contains
// a top-level-await (async-only) module throws `require() async module …
// unsupported` here — exactly the failure drizzle-kit swallows with exit 0.
//
// Run as: bun --bun require-probe.ts <absFile...>
// Emits a JSON array of { file, error } for every file that failed to require.
const failures: { file: string; error: string }[] = [];
for (const f of process.argv.slice(2)) {
  try {
    require(f);
  } catch (e) {
    failures.push({ file: f, error: String(e) });
  }
}
process.stdout.write(JSON.stringify(failures));
