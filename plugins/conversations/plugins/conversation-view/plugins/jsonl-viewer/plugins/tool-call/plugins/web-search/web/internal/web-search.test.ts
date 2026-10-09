import { describe, expect, test } from "bun:test";
import type { ToolCallEvent } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { groupBySite, parseWebSearchResult, readWebSearch } from "./web-search";

const RESULT = `Web search results for query: "m5 geekbench"

Links: [{"title":"A","url":"https://www.cpu-monkey.com/a"},{"title":"B","url":"https://tomshardware.com/b"}]

Links: [{"title":"A again","url":"https://www.cpu-monkey.com/a"},{"title":"C","url":"https://cpu-monkey.com/c"}]

**Short answer:** Apple leads.

- M5 at 4,133


REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.`;

const call = (
  input: unknown,
  result?: { content: string; isError?: boolean },
): ToolCallEvent => ({
  kind: "tool-call",
  at: "2026-10-09T00:00:00.000Z",
  toolUseId: "tu-1",
  name: "WebSearch",
  input,
  result: result && { at: "2026-10-09T00:00:01.000Z", ...result },
});

describe("parseWebSearchResult", () => {
  test("merges every Links round, dropping repeated URLs", () => {
    const { links } = parseWebSearchResult(RESULT);
    expect(links.map((l) => l.title)).toEqual(["A", "B", "C"]);
  });

  test("keeps only the summary: no header, links or reminder", () => {
    const { summary } = parseWebSearchResult(RESULT);
    expect(summary).toBe("**Short answer:** Apple leads.\n\n- M5 at 4,133");
  });
});

describe("groupBySite", () => {
  test("groups www and bare hosts together, busiest first", () => {
    const sites = groupBySite(parseWebSearchResult(RESULT).links);
    expect(sites.map((s) => [s.host, s.links.length])).toEqual([
      ["cpu-monkey.com", 2],
      ["tomshardware.com", 1],
    ]);
  });
});

describe("readWebSearch", () => {
  test("reads allowed_domains as an only-scope", () => {
    const s = readWebSearch(
      call({ query: " q ", allowed_domains: ["a.com"] }, { content: RESULT }),
    );
    expect(s.query).toBe("q");
    expect(s.scope).toEqual({ kind: "only", domains: ["a.com"] });
    expect(s.outcome?.links).toHaveLength(3);
  });

  test("a failed or running call has no outcome", () => {
    expect(
      readWebSearch(call({ query: "q" }, { content: "denied", isError: true }))
        .outcome,
    ).toBeUndefined();
    expect(readWebSearch(call({ query: "q" })).outcome).toBeUndefined();
  });
});
