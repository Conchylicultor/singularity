import { describe, expect, test } from "bun:test";
import { parseLiveStatePayload } from "./parse-payload";

describe("parseLiveStatePayload", () => {
  test("parses a scoped UPDATE with ids", () => {
    expect(
      parseLiveStatePayload(`{"t":"tasks","op":"U","ids":["a","b"]}`),
    ).toEqual({ table: "tasks", op: "U", ids: ["a", "b"] });
  });

  test("parses an INSERT with ids", () => {
    expect(
      parseLiveStatePayload(`{"t":"tasks","op":"I","ids":["x"]}`),
    ).toEqual({ table: "tasks", op: "I", ids: ["x"] });
  });

  test("parses a DELETE", () => {
    expect(
      parseLiveStatePayload(`{"t":"tasks","op":"D","ids":["x"]}`),
    ).toEqual({ table: "tasks", op: "D", ids: ["x"] });
  });

  test("ids null → FULL-for-table", () => {
    expect(
      parseLiveStatePayload(`{"t":"tasks","op":"U","ids":null}`),
    ).toEqual({ table: "tasks", op: "U", ids: null });
  });

  test("missing ids → null", () => {
    expect(parseLiveStatePayload(`{"t":"tasks","op":"U"}`)).toEqual({
      table: "tasks",
      op: "U",
      ids: null,
    });
  });

  test("empty ids array stays empty (consumer treats empty as FULL)", () => {
    expect(
      parseLiveStatePayload(`{"t":"tasks","op":"U","ids":[]}`),
    ).toEqual({ table: "tasks", op: "U", ids: [] });
  });

  test("invalid JSON → null", () => {
    expect(parseLiveStatePayload("not json")).toBeNull();
    expect(parseLiveStatePayload("")).toBeNull();
  });

  test("non-object JSON → null", () => {
    expect(parseLiveStatePayload(`"a string"`)).toBeNull();
    expect(parseLiveStatePayload(`42`)).toBeNull();
    expect(parseLiveStatePayload(`null`)).toBeNull();
    expect(parseLiveStatePayload(`[1,2,3]`)).toBeNull();
  });

  test("missing/empty table → null", () => {
    expect(parseLiveStatePayload(`{"op":"U","ids":null}`)).toBeNull();
    expect(parseLiveStatePayload(`{"t":"","op":"U","ids":null}`)).toBeNull();
  });

  test("bad op → null", () => {
    expect(parseLiveStatePayload(`{"t":"tasks","op":"X","ids":null}`)).toBeNull();
    expect(
      parseLiveStatePayload(`{"t":"tasks","op":"INSERT","ids":null}`),
    ).toBeNull();
    expect(parseLiveStatePayload(`{"t":"tasks","ids":null}`)).toBeNull();
  });

  test("ids present but wrong shape → null", () => {
    expect(
      parseLiveStatePayload(`{"t":"tasks","op":"U","ids":[1,2]}`),
    ).toBeNull();
    expect(
      parseLiveStatePayload(`{"t":"tasks","op":"U","ids":"x"}`),
    ).toBeNull();
    expect(
      parseLiveStatePayload(`{"t":"tasks","op":"U","ids":["ok",3]}`),
    ).toBeNull();
  });
});
