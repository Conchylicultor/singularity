/**
 * Refusals — a loader throwing `ResourceRefusal` (an expected, caller-caused
 * "this question cannot be answered as asked"). Pins:
 *   - the sub-ack read sends `sub-error reason:"refused"` WITH the message;
 *   - the HTTP read answers 422 `{ reason: "refused", detail }`;
 *   - neither files a report (it is not a server failure);
 *   - any other loader throw is unchanged: `loader-failed`, reported.
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { z } from "zod";
import { ResourceRefusal } from "@plugins/packages/plugins/resource-protocol/core";
import { createHarness } from "./test-support";

class UnknownThing extends ResourceRefusal {}

function setup(fail: () => never) {
  const reported: unknown[] = [];
  const h = createHarness({ reportError: (_c, err) => reported.push(err) });
  h.runtime.defineExternalResource(
    { key: "q", schema: z.string(), validateParams: () => {} },
    { mode: "push", loader: async () => fail() },
  );
  return { h, reported };
}

const refuse = (): never => {
  throw new UnknownThing('unknown metric "x"');
};
const crash = (): never => {
  throw new Error("db down");
};

let info: ReturnType<typeof spyOn>;
let error: ReturnType<typeof spyOn>;
beforeEach(() => {
  info = spyOn(console, "info").mockImplementation(() => {});
  error = spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  info.mockRestore();
  error.mockRestore();
});

const get = (h: ReturnType<typeof setup>["h"]) =>
  h.runtime.handleResourceHttp(new Request("http://x/api/resources/q"), {
    key: "q",
  });

describe("refusal", () => {
  test("WS: the sub-error is `refused` with the message, and nothing is reported", async () => {
    const { h, reported } = setup(refuse);
    await h.subscribe("q", {});
    expect(h.frames.at(-1)).toMatchObject({
      kind: "sub-error",
      key: "q",
      reason: "refused",
      message: 'unknown metric "x"',
    });
    expect(reported).toEqual([]);
    expect(error).not.toHaveBeenCalled();
  });

  test("HTTP: a 422 with the message as `detail`, and nothing is reported", async () => {
    const { h, reported } = setup(refuse);
    const res = await get(h);
    expect(res.status).toBe(422);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      reason: "refused",
      detail: 'unknown metric "x"',
    });
    expect(reported).toEqual([]);
  });

  test("any other throw is unchanged: loader-failed, reported", async () => {
    const { h, reported } = setup(crash);
    await h.subscribe("q", {});
    const frame = h.frames.at(-1) as unknown as Record<string, unknown>;
    expect(frame).toMatchObject({ kind: "sub-error", reason: "loader-failed" });
    expect("message" in frame).toBe(false);
    const res = await get(h);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ reason: "loader-failed" });
    expect(reported).toHaveLength(2);
  });
});
