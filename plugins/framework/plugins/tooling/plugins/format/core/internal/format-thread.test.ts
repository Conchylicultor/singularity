import { expect, test } from "bun:test";
import { formatOffThread } from "./format-thread";
import { formatSource } from "./prettier";

const UNFORMATTED = "const  x=1\n";
const FORMATTED = "const x = 1;\n";

test("answers what formatSource answers, in order", async () => {
  const sources = [
    { file: "a.ts", content: UNFORMATTED },
    { file: "b.tsx", content: FORMATTED },
    { file: "c.ts", content: "export  function f(){return 1}\n" },
  ];
  const expected = await Promise.all(sources.map((s) => formatSource(s)));
  expect(await formatOffThread(sources)).toEqual(expected);
});

test("the same bytes asked twice, and in one batch, get the same answer", async () => {
  const source = { file: "dup.ts", content: "let  y=2\n" };
  const [a, b] = await formatOffThread([source, source]);
  expect(a).toBe("let y = 2;\n");
  expect(b).toBe(a);
  expect(await formatOffThread([source])).toEqual([a!]);
});

test("a held-out path rejects with formatSource's own error", async () => {
  let error: unknown;
  try {
    await formatOffThread([{ file: "README.md", content: UNFORMATTED }]);
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toMatch(/not a formattable path/);
});

test("a syntax error rejects, and the bytes are not remembered as an answer", async () => {
  const broken = { file: "broken.ts", content: "const = ;\n" };
  for (let attempt = 0; attempt < 2; attempt++) {
    let error: unknown;
    try {
      await formatOffThread([broken]);
    } catch (err) {
      error = err;
    }
    expect((error as Error).message).toMatch(
      /prettier failed to format broken\.ts/,
    );
  }
  // The worker survives a failed request.
  expect(
    await formatOffThread([{ file: "after.ts", content: UNFORMATTED }]),
  ).toEqual([FORMATTED]);
});
