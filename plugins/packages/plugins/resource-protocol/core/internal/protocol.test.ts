import { describe, expect, test } from "bun:test";
import {
  ResourceContractError,
  contractVerdict,
  parseResourceHttpErrorBody,
} from "./protocol";

describe("contractVerdict", () => {
  test("a client that names no build predates the protocol: skew", () => {
    expect(contractVerdict(undefined, "g1")).toBe("skew");
    expect(contractVerdict(undefined, null)).toBe("skew");
  });
  test("a dev bundle or an unknown server graph cannot be judged", () => {
    expect(contractVerdict("dev", "g1")).toBe("unknown");
    expect(contractVerdict("g1", null)).toBe("unknown");
  });
  test("a different graph is skew, the same graph is a real bug", () => {
    expect(contractVerdict("g0", "g1")).toBe("skew");
    expect(contractVerdict("g1", "g1")).toBe("same-build");
  });
});

describe("parseResourceHttpErrorBody", () => {
  test("reads a typed body", () => {
    expect(
      parseResourceHttpErrorBody({
        reason: "contract-mismatch",
        verdict: "skew",
        detail: "x",
      }),
    ).toEqual({ reason: "contract-mismatch", verdict: "skew", detail: "x" });
  });
  test("refuses anything that is not one", () => {
    expect(parseResourceHttpErrorBody("Loader failed")).toBeUndefined();
    expect(parseResourceHttpErrorBody({ reason: "nope" })).toBeUndefined();
    expect(parseResourceHttpErrorBody(null)).toBeUndefined();
  });
  test("drops an unknown verdict rather than trusting it", () => {
    expect(
      parseResourceHttpErrorBody({ reason: "unknown-key", verdict: "maybe" }),
    ).toEqual({ reason: "unknown-key" });
  });
});

test("ResourceContractError keeps the detail as its message", () => {
  const err = new ResourceContractError("k", "bad params");
  expect(err.message).toBe("bad params");
  expect(err.key).toBe("k");
  expect(err).toBeInstanceOf(Error);
});
