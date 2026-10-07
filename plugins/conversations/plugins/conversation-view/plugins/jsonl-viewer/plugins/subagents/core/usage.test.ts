import { describe, expect, test } from "bun:test";
import { emptyUsageFold, foldUsageLine } from "./usage";

const assistant = (id: string, output: number, input = 0) => ({
  type: "assistant",
  message: {
    role: "assistant",
    id,
    content: [],
    usage: { input_tokens: input, output_tokens: output },
  },
});

describe("foldUsageLine", () => {
  test("counts each message once, on its first line", () => {
    const fold = emptyUsageFold();
    foldUsageLine(fold, assistant("m1", 10, 3));
    foldUsageLine(fold, assistant("m1", 12, 3)); // a later block of m1
    foldUsageLine(fold, assistant("m2", 5));
    expect(fold.totals).toEqual({
      input: 3,
      output: 15,
      cacheRead: 0,
      cacheCreation: 0,
    });
  });

  test("ignores user lines and assistant lines with no id or usage", () => {
    const fold = emptyUsageFold();
    foldUsageLine(fold, { type: "user", message: { role: "user" } });
    foldUsageLine(fold, {
      type: "assistant",
      message: { role: "assistant", usage: { output_tokens: 9 } },
    });
    foldUsageLine(fold, {
      type: "assistant",
      message: { role: "assistant", id: "m3" },
    });
    expect(fold.totals.output).toBe(0);
    expect(fold.counted.size).toBe(0);
  });
});
