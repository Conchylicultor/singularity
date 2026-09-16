/**
 * What one runner's JUnit report says about a test run, reduced to the two
 * facts a comparison needs: which test cases failed, and which test files the
 * report mentions at all.
 *
 * Both runners write JUnit (`bun test --reporter=junit`, vitest's `junit`
 * reporter). Their shapes differ in the details — bun nests a `<testsuite>` per
 * `describe` and puts `file` on every element, vitest puts the file in the
 * top-level suite's `name` and the describe path in the case `name` — so a
 * case is identified by its file plus every enclosing suite name below the file
 * plus its own name, which is stable across runs of the same code under either.
 *
 * A file that throws while loading has no `<testsuite>` in bun's report at
 * all. The report cannot name it; the caller, which knows which files it asked
 * to run, compares against `files`.
 */
export interface JunitSummary {
  /** `<file> > <suite> > … > <case>` for every case with a failure or error. */
  failures: string[];
  /** Every test file the report mentions (a suite's `file`, else its `name`). */
  files: string[];
}

const ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

function decode(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (whole, ref: string) => {
    if (ref.startsWith("#x"))
      return String.fromCodePoint(parseInt(ref.slice(2), 16));
    if (ref.startsWith("#")) return String.fromCodePoint(Number(ref.slice(1)));
    return ENTITIES[ref] ?? whole;
  });
}

function attr(tag: string, name: string): string | undefined {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : decode(value);
}

export function parseJunit(xml: string): JunitSummary {
  const failures: string[] = [];
  const files = new Set<string>();
  // Each open suite: its name, and whether it is the file-level one.
  const suites: Array<{ name: string; file: string | undefined }> = [];
  let openCase: { id: string; failed: boolean } | null = null;

  const tags = /<(\/?)(testsuite|testcase|failure|error)\b([^>]*?)(\/?)>/g;
  for (const [, closing, kind, rest, selfClosing] of xml.matchAll(tags)) {
    const tag = ` ${rest}`;
    if (kind === "testsuite") {
      if (closing) {
        suites.pop();
        continue;
      }
      const name = attr(tag, "name") ?? "";
      const file =
        attr(tag, "file") ?? (suites.length === 0 ? name : undefined);
      if (suites.length === 0 && file !== undefined) files.add(file);
      if (!selfClosing) suites.push({ name, file });
      continue;
    }
    if (kind === "testcase") {
      if (closing) {
        if (openCase?.failed) failures.push(openCase.id);
        openCase = null;
        continue;
      }
      const top = suites[0];
      const file = attr(tag, "file") ?? top?.file ?? top?.name ?? "";
      const path = suites.slice(1).map((s) => s.name);
      const id = [file, ...path, attr(tag, "name") ?? ""].join(" > ");
      if (selfClosing) continue;
      openCase = { id, failed: false };
      continue;
    }
    // <failure> / <error>, inside a case.
    if (!closing && openCase !== null) openCase.failed = true;
  }
  return { failures, files: [...files] };
}
