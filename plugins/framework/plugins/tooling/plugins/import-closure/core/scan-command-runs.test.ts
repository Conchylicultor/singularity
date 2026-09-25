import { describe, expect, test } from "bun:test";
import { scanCommandRuns } from "./import-closure";

describe("scanCommandRuns", () => {
  test("names nested leaves by their verb path and keeps non-run imports apart", async () => {
    const scan = await scanCommandRuns(
      "index.ts",
      `export default defineCliCommand({\n` +
        `  name: "deploy",\n` +
        `  description: "",\n` +
        `  subcommands: [\n` +
        `    defineCliCommand({ name: "converge", description: "", run: () => import("./converge") }),\n` +
        `    defineCliCommand({ name: "ship", description: "", run: () => import("./ship") }),\n` +
        `  ],\n` +
        `});\n` +
        `const eager = () => import("./eager");\n`,
    );
    expect(Object.fromEntries(scan.runs)).toEqual({
      "./converge": ["deploy converge"],
      "./ship": ["deploy ship"],
    });
    expect([...scan.other]).toEqual(["./eager"]);
  });

  test("a module that never mentions defineCliCommand has no run edges", async () => {
    const scan = await scanCommandRuns(
      "x.ts",
      `export const run = () => import("./run");\n`,
    );
    expect(scan.runs.size).toBe(0);
  });
});
