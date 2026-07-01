import { describe, expect, test } from "bun:test";
import { deltaEtag, graphEtag } from "./etag";

const HEAD_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HEAD_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const MAIN_A = "1111111111111111111111111111111111111111";
const MAIN_B = "2222222222222222222222222222222222222222";
const PUSH_1 = "cccccccccccccccccccccccccccccccccccccccc";
const PUSH_2 = "dddddddddddddddddddddddddddddddddddddddd";

describe("deltaEtag", () => {
  test("identical inputs ⇒ identical string", () => {
    expect(deltaEtag(HEAD_A, MAIN_A)).toBe(deltaEtag(HEAD_A, MAIN_A));
  });

  test("a changed headSha ⇒ a different string", () => {
    expect(deltaEtag(HEAD_A, MAIN_A)).not.toBe(deltaEtag(HEAD_B, MAIN_A));
  });

  test("a changed mainSha ⇒ a different string", () => {
    expect(deltaEtag(HEAD_A, MAIN_A)).not.toBe(deltaEtag(HEAD_A, MAIN_B));
  });

  test("head/main are not conflated (order matters)", () => {
    expect(deltaEtag(HEAD_A, MAIN_A)).not.toBe(deltaEtag(MAIN_A, HEAD_A));
  });
});

describe("graphEtag", () => {
  test("identical inputs ⇒ identical string", () => {
    expect(graphEtag(HEAD_A, MAIN_A, [PUSH_1, PUSH_2])).toBe(
      graphEtag(HEAD_A, MAIN_A, [PUSH_1, PUSH_2]),
    );
  });

  test("a changed headSha ⇒ a different string", () => {
    expect(graphEtag(HEAD_A, MAIN_A, [])).not.toBe(graphEtag(HEAD_B, MAIN_A, []));
  });

  test("a changed mainSha ⇒ a different string", () => {
    expect(graphEtag(HEAD_A, MAIN_A, [])).not.toBe(graphEtag(HEAD_A, MAIN_B, []));
  });

  test("adding a pushed sha ⇒ a different string", () => {
    expect(graphEtag(HEAD_A, MAIN_A, [PUSH_1])).not.toBe(
      graphEtag(HEAD_A, MAIN_A, [PUSH_1, PUSH_2]),
    );
  });

  test("pushedShas order does not affect the signature (sorted)", () => {
    expect(graphEtag(HEAD_A, MAIN_A, [PUSH_1, PUSH_2])).toBe(
      graphEtag(HEAD_A, MAIN_A, [PUSH_2, PUSH_1]),
    );
  });

  test("distinct from deltaEtag on the same tips (folds pushedShas)", () => {
    expect(graphEtag(HEAD_A, MAIN_A, [PUSH_1])).not.toBe(deltaEtag(HEAD_A, MAIN_A));
  });
});
