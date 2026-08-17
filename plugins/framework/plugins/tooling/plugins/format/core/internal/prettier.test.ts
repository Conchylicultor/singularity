import { expect, test } from "bun:test";
import { formatIfFormattable, formatSource, isFormattable } from "./prettier";

const UNFORMATTED = "const  x=1\n";
const FORMATTED = "const x = 1;\n";

/**
 * Await `p` and return the Error it rejected with; throw if it resolved.
 * `expect(p).rejects.toThrow()` is typed `void` under bun:test (see the
 * git-roots and host-semaphore suites' identical helper), so this asserts the
 * rejection for real and hands back the error to pin its message.
 */
async function rejection(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected the promise to reject, but it resolved");
}

test("formats an allowlisted source file", async () => {
  expect(await formatSource({ file: "a.ts", content: UNFORMATTED })).toBe(
    FORMATTED,
  );
});

test("formatting is idempotent on its own output", async () => {
  const once = await formatSource({ file: "a.tsx", content: UNFORMATTED });
  expect(await formatSource({ file: "a.tsx", content: once })).toBe(once);
});

// Non-formattable is a THROW, not the input echoed back. The two conditions
// "this type is held out" and "the caller handed me garbage" must not share a
// return value — that is what made the argument swap silent.
test.each([
  ["README.md", "a markdown doc"],
  ["x.origin.jsonc", "a config origin"],
  ["app.css", "a stylesheet"],
  ["web.generated.ts", "a generated artifact"],
])("formatSource throws for %s (%s)", async (file) => {
  expect(isFormattable(file)).toBe(false);
  const err = await rejection(formatSource({ file, content: UNFORMATTED }));
  expect(err.message).toMatch(/not a formattable path/);
});

// The 2026-08-17 incident, verbatim: an ad-hoc script called
// `formatSource(source, file)`, got the PATH back as "formatted source", wrote
// it, and destroyed 44 files with no error of any kind.
test("a swapped call throws and names the swap", async () => {
  const source = "import { join } from 'path'\nconst x=1\n";
  const err = await rejection(formatSource({ file: source, content: "a.ts" }));
  expect(err.message).toMatch(
    /Arguments swapped\? The shape is \{ file, content \}/,
  );
});

test("an empty file argument throws", async () => {
  const err = await rejection(formatSource({ file: "", content: UNFORMATTED }));
  expect(err.message).toMatch(/"file" is empty/);
});

test("a file argument longer than any path throws", async () => {
  const err = await rejection(
    formatSource({ file: "a".repeat(4097), content: UNFORMATTED }),
  );
  expect(err.message).toMatch(/longer than any path/);
});

test.each(["README.md", "x.origin.jsonc", "app.css", "web.generated.ts"])(
  "formatIfFormattable returns %s byte-identical",
  async (file) => {
    expect(await formatIfFormattable({ file, content: UNFORMATTED })).toBe(
      UNFORMATTED,
    );
  },
);

test("formatIfFormattable still formats an allowlisted path", async () => {
  expect(
    await formatIfFormattable({ file: "a.mts", content: UNFORMATTED }),
  ).toBe(FORMATTED);
});

// The permissive arm is where a swapped call used to land silently, so it
// carries the same path assertion rather than trusting its caller.
test("formatIfFormattable rejects a non-path file argument", async () => {
  const err = await rejection(
    formatIfFormattable({ file: "const x=1\n", content: "a.ts" }),
  );
  expect(err.message).toMatch(/Arguments swapped\?/);
});
