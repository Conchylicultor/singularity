import { describe, expect, test } from "bun:test";
import {
  collectContributions,
  defineServerContribution,
} from "./contributions";

const Alpha = defineServerContribution<{ name: string }>("test.alpha");
const Beta = defineServerContribution<{ name: string }>("test.beta");

describe("ServerContributionToken.from", () => {
  test("reads only its own kind out of plugin definitions, with the payload", () => {
    const plugins = [
      { contributions: [Alpha({ name: "a1" }), Beta({ name: "b1" })] },
      {},
      { contributions: [Alpha({ name: "a2" })] },
    ];
    expect(Alpha.from(plugins).map((c) => c.name)).toEqual(["a1", "a2"]);
    expect(Beta.from(plugins).map((c) => c.name)).toEqual(["b1"]);
  });

  test("two tokens with the same debug name stay distinct", () => {
    const Twin = defineServerContribution<{ name: string }>("test.alpha");
    expect(Twin.from([{ contributions: [Alpha({ name: "a" })] }])).toEqual([]);
  });

  test("reads no boot state: independent of what was collected", () => {
    collectContributions([
      { id: "p", contributions: [Alpha({ name: "collected" })] },
    ]);
    expect(
      Alpha.from([{ contributions: [Alpha({ name: "given" })] }]).map(
        (c) => c.name,
      ),
    ).toEqual(["given"]);
  });
});

describe("after collectContributions", () => {
  test("getContributions and getContributionsIfCollected agree; an absent kind is []", () => {
    collectContributions([{ id: "p", contributions: [Alpha({ name: "a" })] }]);
    expect(Alpha.getContributions().map((c) => c.name)).toEqual(["a"]);
    expect(Alpha.getContributionsIfCollected()?.map((c) => c.name)).toEqual([
      "a",
    ]);
    expect(Beta.getContributions()).toEqual([]);
    expect(Beta.getContributionsIfCollected()).toEqual([]);
  });
});
