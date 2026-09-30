import { describe, expect, test } from "bun:test";
import { declaredDep, declaredDeps, UnknownDepError } from "./registry";

describe("the declared-dependency registry", () => {
  test("is read from the generated registry, with nothing booted", async () => {
    const deps = await declaredDeps();
    expect(deps.map((d) => d.id)).toContain("hello-python");
    expect(new Set(deps.map((d) => d.id)).size).toBe(deps.length);
    expect((await declaredDep("hello-python")).source.kind).toBe("python");
  });

  test("an unknown id throws naming the declared ones", async () => {
    const err = await declaredDep("no-such-dep").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnknownDepError);
    expect((err as Error).message).toContain("hello-python");
  });
});
