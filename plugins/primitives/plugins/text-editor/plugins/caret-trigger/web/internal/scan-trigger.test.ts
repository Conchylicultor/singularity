import { describe, expect, test } from "bun:test";
import { scanTrigger } from "./scan-trigger";

describe("scanTrigger", () => {
  test("null when the trigger is absent", () => {
    expect(scanTrigger("hello world", "/")).toBeNull();
    expect(scanTrigger("", "@")).toBeNull();
  });

  test("query is the text after the trigger", () => {
    expect(scanTrigger("/head", "/")).toEqual({ triggerIndex: 0, query: "head" });
    expect(scanTrigger("go [[foo", "[[")).toEqual({ triggerIndex: 3, query: "foo" });
  });

  test("empty query immediately after the trigger", () => {
    expect(scanTrigger("/", "/")).toEqual({ triggerIndex: 0, query: "" });
  });

  test("caret inside a partially-typed multi-char trigger yields null", () => {
    // The lone `[` of a `[[` the user has only half-typed must not match.
    expect(scanTrigger("go [", "[[")).toBeNull();
  });

  test("two triggers in one node resolve to the rightmost (lastIndexOf)", () => {
    expect(scanTrigger("/bar hello /foo", "/")).toEqual({ triggerIndex: 11, query: "foo" });
  });

  test("multi-char trigger query stops nothing — it is the raw tail", () => {
    expect(scanTrigger("x $$a+b", "$$")).toEqual({ triggerIndex: 2, query: "a+b" });
  });
});
