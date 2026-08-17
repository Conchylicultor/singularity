/**
 * The guard on the inline page-link token.
 *
 * The rule this file exists to enforce: **a fixture may never hand-write an
 * id.** The retired pattern (`block-<epochMillis>-<base36>`) shipped dead for
 * every link minted after `newBlockId()` moved to `block-<uuid>`, and stayed
 * invisible precisely because every test fed the parser a literal of the shape
 * the parser still expected. So the load-bearing assertion here asks the REAL
 * mint for its id, and fails the day the mint changes again.
 */

import { describe, expect, test } from "bun:test";
import { newBlockId } from "@plugins/page/plugins/editor/core";
import {
  PAGE_LINK_TOKEN_PATTERN,
  pageLinkToken,
  scanPageLinkTokens,
} from "./tokens";

/** A token of the pre-namespace form, which only ever has to PARSE. */
const LEGACY_TOKEN = "[[block-1718000000000-abc123]]";
const LEGACY_ID = "block-1718000000000-abc123";

describe("PAGE_LINK_TOKEN_PATTERN", () => {
  test("matches a token built from a REAL minted id", () => {
    expect(PAGE_LINK_TOKEN_PATTERN.test(pageLinkToken(newBlockId()))).toBe(
      true,
    );
  });

  test("the namespaced form yields the id in group 1", () => {
    const id = newBlockId();
    const m = PAGE_LINK_TOKEN_PATTERN.exec(pageLinkToken(id));
    expect(m?.[1]).toBe(id);
    expect(m?.[2]).toBeUndefined();
  });

  test("the pre-namespace form still parses, in group 2", () => {
    const m = PAGE_LINK_TOKEN_PATTERN.exec(LEGACY_TOKEN);
    expect(m?.[1]).toBeUndefined();
    expect(m?.[2]).toBe(LEGACY_ID);
  });

  test("plain `[[…]]` text a user typed is not a token", () => {
    expect(PAGE_LINK_TOKEN_PATTERN.test("[[not a token]]")).toBe(false);
    expect(PAGE_LINK_TOKEN_PATTERN.test("[[]]")).toBe(false);
    // An empty namespaced body names no page.
    expect(PAGE_LINK_TOKEN_PATTERN.test("[[page:]]")).toBe(false);
    // The body may not swallow the closing delimiter.
    expect(PAGE_LINK_TOKEN_PATTERN.test("[[page:a\nb]]")).toBe(false);
  });
});

describe("scanPageLinkTokens", () => {
  test("round-trips a real minted id out of surrounding prose", () => {
    const id = newBlockId();
    expect(scanPageLinkTokens(`see ${pageLinkToken(id)} for details`)).toEqual([
      id,
    ]);
  });

  test("yields both forms, in document order", () => {
    const id = newBlockId();
    expect(
      scanPageLinkTokens(`${LEGACY_TOKEN} then ${pageLinkToken(id)}`),
    ).toEqual([LEGACY_ID, id]);
  });

  test("a token stops at its own delimiter, whatever follows", () => {
    expect(scanPageLinkTokens("[[page:a]]b")).toEqual(["a"]);
  });

  test("text with no token yields nothing", () => {
    expect(scanPageLinkTokens("[[not a token]] and [[page:]]")).toEqual([]);
  });
});
