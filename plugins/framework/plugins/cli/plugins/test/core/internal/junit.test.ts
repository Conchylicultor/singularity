import { describe, expect, test } from "bun:test";
import { parseJunit } from "./junit";

// Shape of `bun test --reporter=junit` (1.4.2), trimmed: nested suite per
// `describe`, `file` on every element. A file that failed to load is absent.
const BUN = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="3" failures="2">
  <testsuite name="a.test.ts" file="a.test.ts" tests="2" failures="1">
    <testcase name="ok" classname="" file="a.test.ts" line="2" />
    <testcase name="bad &lt;x&gt;" classname="" file="a.test.ts" line="3">
      <failure type="AssertionError" message="expect(received).toBe(expected)">AssertionError</failure>
    </testcase>
  </testsuite>
  <testsuite name="b.test.ts" file="b.test.ts" tests="1" failures="1">
    <testsuite name="grp" file="b.test.ts" line="2" tests="1" failures="1">
      <testcase name="inner" classname="grp" file="b.test.ts" line="2">
        <failure type="AssertionError">AssertionError</failure>
      </testcase>
    </testsuite>
  </testsuite>
</testsuites>`;

// Shape of vitest's junit reporter: the file is the top suite's name, the
// describe path is part of the case name.
const VITEST = `<?xml version="1.0" encoding="UTF-8" ?>
<testsuites name="vitest tests" tests="2" failures="1" errors="0">
    <testsuite name="fixture/web/__tests__/a.test.tsx" tests="2" failures="1">
        <testcase classname="fixture/web/__tests__/a.test.tsx" name="grp &gt; renders">
        </testcase>
        <testcase classname="fixture/web/__tests__/a.test.tsx" name="grp &gt; breaks">
            <failure message="nope" type="AssertionError">AssertionError: nope</failure>
        </testcase>
    </testsuite>
</testsuites>`;

describe("parseJunit", () => {
  test("bun: failing cases keyed by file and describe path", () => {
    expect(parseJunit(BUN)).toEqual({
      failures: ["a.test.ts > bad <x>", "b.test.ts > grp > inner"],
      files: ["a.test.ts", "b.test.ts"],
    });
  });

  test("vitest: the file comes from the top suite's name", () => {
    expect(parseJunit(VITEST)).toEqual({
      failures: ["fixture/web/__tests__/a.test.tsx > grp > breaks"],
      files: ["fixture/web/__tests__/a.test.tsx"],
    });
  });

  test("an empty report has nothing", () => {
    expect(parseJunit("<testsuites/>")).toEqual({ failures: [], files: [] });
  });
});
