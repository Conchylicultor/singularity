import { describe, expect, test } from "bun:test";
import { optimisticRejectionFingerprint } from "./optimistic-rejection-kind";

const base = {
  resourceKey: "page.blocks",
  params: { pageId: "page-1" },
  label: "Page",
  status: 400,
  message: "block block-1789643584-ldt6ab is not on page",
  opSummary: "bulkMove",
};

describe("optimisticRejectionFingerprint", () => {
  test("params and per-occurrence ids do not split one finding", async () => {
    const a = await optimisticRejectionFingerprint(base);
    const b = await optimisticRejectionFingerprint({
      ...base,
      params: { pageId: "page-2" },
      message: "block block-1789000000-zzzz is not on page",
    });
    expect(b).toBe(a);
  });

  test("a different status, op or reason is a different finding", async () => {
    const a = await optimisticRejectionFingerprint(base);
    expect(
      await optimisticRejectionFingerprint({ ...base, status: 404 }),
    ).not.toBe(a);
    expect(
      await optimisticRejectionFingerprint({ ...base, opSummary: "move" }),
    ).not.toBe(a);
    expect(
      await optimisticRejectionFingerprint({
        ...base,
        message: "validation failed",
      }),
    ).not.toBe(a);
  });
});
