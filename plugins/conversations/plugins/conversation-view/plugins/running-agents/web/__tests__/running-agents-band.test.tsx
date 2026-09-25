import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import {
  PluginProvider,
  type LoadedPlugin,
} from "@plugins/framework/plugins/web-sdk/core";
import type { Conversation as ConversationRecord } from "@plugins/tasks/plugins/tasks-core/core";
import type {
  SubagentEntry,
  useConversationSubagents,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/subagents/web";
import type { HostedToolbarParts } from "@plugins/primitives/plugins/data-view/core";
import { RunningAgentsBand } from "../components/running-agents-band";

/**
 * The band over fixture sub-agents: what it says about them, what it shows for
 * one that just stopped, what it drops, and that the summary line folds it.
 *
 * Two seams are stubbed and nothing else. The sub-agent read, because this
 * suite is about the band and not about the join it deliberately does not do —
 * that lives in the subagents plugin, with its own tests. And the DataView,
 * down to "call the frame with the rows", because how rows draw is the
 * primitive's own tested behaviour: what is asserted here is the field schema
 * the band projects and the card it draws around them.
 */

type ConversationSubagents = ReturnType<typeof useConversationSubagents>;

/** What the stubbed sub-agent read answers on the next render. */
let subagents: ConversationSubagents = { kind: "pending" };

vi.mock(
  "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/subagents/web",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useConversationSubagents: () => subagents,
  }),
);

/** The shape of `DataViewProps` this band actually uses. */
interface FakeDataViewProps {
  rows: readonly unknown[];
  fields: {
    id: string;
    value?: (row: never) => unknown;
    cell?: (row: never) => ReactNode;
  }[];
  rowKey: (row: never, index: number) => string;
  toolbar?: { kind?: string; frame?: ComponentType<HostedToolbarParts> };
  viewOptions?: { list?: { leading?: (row: never) => ReactNode } };
}

vi.mock("@plugins/primitives/plugins/data-view/web", async () => {
  const { createElement } = await import("react");
  return {
    defineDataView: (id: string) => id,
    DataView: (props: FakeDataViewProps) => {
      const frame = props.toolbar?.frame;
      if (props.toolbar?.kind !== "hosted" || frame === undefined) {
        throw new Error("the band must draw its rows through a hosted frame");
      }
      const leading = props.viewOptions?.list?.leading;
      const body = createElement(
        "ul",
        { "data-testid": "rows" },
        props.rows.map((row, index) => {
          const key = props.rowKey(row as never, index);
          return createElement(
            "li",
            { key, "data-testid": `row:${key}` },
            leading?.(row as never),
            ...props.fields.map((field) =>
              createElement(
                "span",
                { key: field.id, "data-testid": `cell:${key}:${field.id}` },
                field.cell
                  ? field.cell(row as never)
                  : String(field.value?.(row as never) ?? ""),
              ),
            ),
          );
        }),
      );
      return createElement(frame, {
        options: createElement("button", { type: "button" }, "View options"),
        switcher: null,
        creators: null,
        body,
        stickyRef: () => {},
      });
    },
  };
});

const plugin = {
  id: "conversations-running-agents-test",
  description: "running-agents band fixture",
  contributions: [],
} as unknown as LoadedPlugin;

const conversation = {
  id: "conv-1",
  status: "working",
} as unknown as ConversationRecord;

/** A fixed "now", so every duration below renders exactly one string. */
const NOW = Date.parse("2026-09-22T12:00:00.000Z");
const ago = (seconds: number) => new Date(NOW - seconds * 1000);

function entry(over: {
  id: string;
  agentType?: string;
  description?: string;
  model?: string;
  requestShape?: "background" | "foreground";
  startedAgo: number;
  state: SubagentEntry["state"];
  endedAgo?: number;
  lastStep?: SubagentEntry["lastStep"];
}): SubagentEntry {
  const lastStep: SubagentEntry["lastStep"] = over.lastStep ?? {
    kind: "tool",
    toolName: "Read",
    preview: "auth.ts",
  };
  return {
    row: {
      kind: "described",
      agentId: over.id,
      agentType: over.agentType ?? "Explore",
      description: over.description ?? "Search auth flow",
      toolUseId: `toolu_${over.id}`,
      model: over.model,
      requestShape: over.requestShape,
      startedAt: ago(over.startedAgo).toISOString(),
      lastActivityAt: ago(over.endedAgo ?? 0).toISOString(),
      turnEnded: false,
      lastStep,
    },
    state: over.state,
    startedAt: ago(over.startedAgo),
    endedAt: over.endedAgo === undefined ? null : ago(over.endedAgo),
    lastStep,
    agentToolEvent: undefined,
  };
}

const FIXTURES: SubagentEntry[] = [
  entry({
    id: "fg",
    agentType: "Explore",
    description: "Search auth flow",
    model: "sonnet",
    requestShape: "foreground",
    startedAgo: 74,
    state: { kind: "running" },
  }),
  entry({
    id: "bg",
    agentType: "Plan",
    description: "Design migration path",
    model: "opus",
    requestShape: "background",
    startedAgo: 246,
    state: { kind: "running" },
    lastStep: { kind: "thinking", preview: "weighing the order" },
  }),
  entry({
    id: "just-done",
    description: "Audit endpoint handlers",
    startedAgo: 130,
    state: { kind: "finished" },
    endedAgo: 1,
  }),
  entry({
    id: "ended",
    description: "Rewrite the docs index",
    startedAgo: 200,
    state: { kind: "ended-without-reporting" },
    endedAgo: 2,
  }),
  entry({
    id: "long-done",
    description: "Check hook syntax",
    startedAgo: 600,
    state: { kind: "finished" },
    endedAgo: 300,
  }),
];

const known = (entries: SubagentEntry[]): ConversationSubagents => ({
  kind: "known",
  entries,
  statusOf: () => ({ kind: "pending" }),
});

function renderBand() {
  return render(
    <PluginProvider plugins={[plugin]}>
      <RunningAgentsBand conversation={conversation} />
    </PluginProvider>,
  );
}

const summaryLine = () =>
  screen.getByRole("button", { name: "Running agents" });

beforeEach(() => {
  // Date only: the band's linger timer and the clocks' own ticks stay real, so
  // nothing here depends on advancing them.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the running-agents band", () => {
  it("shows nothing at all while the reads have not landed", () => {
    subagents = { kind: "pending" };
    expect(renderBand().container.innerHTML).toBe("");
  });

  it("shows nothing when no sub-agent is working", () => {
    subagents = known([]);
    expect(renderBand().container.innerHTML).toBe("");
  });

  it("counts what is working and clocks the longest of those", () => {
    subagents = known(FIXTURES);
    renderBand();

    // Two are running; the two that just stopped are shown but not counted.
    expect(summaryLine().textContent).toContain("2 agents working");
    expect(summaryLine().textContent).toContain("longest 4:06");
    expect(summaryLine().getAttribute("aria-expanded")).toBe("true");
  });

  it("lists every sub-agent still on screen, and drops the one whose linger is over", () => {
    subagents = known(FIXTURES);
    renderBand();

    expect(
      [...screen.getByTestId("rows").children].map((row) =>
        row.getAttribute("data-testid"),
      ),
    ).toEqual(["row:fg", "row:bg", "row:just-done", "row:ended"]);
  });

  it("says of each row what it is and what it last did", () => {
    subagents = known(FIXTURES);
    renderBand();

    // The task, then what it last did — one line, so the step is cut first.
    expect(screen.getByTestId("cell:fg:description").textContent).toBe(
      "Search auth flow · Read auth.ts",
    );
    expect(screen.getByTestId("cell:fg:type").textContent).toBe("Explore");
    expect(screen.getByTestId("cell:fg:model").textContent).toBe("sonnet");
    expect(screen.getByTestId("cell:fg:lastStep").textContent).toBe(
      "Read auth.ts",
    );
    // A foreground agent says nothing about where it runs; a background one does.
    expect(screen.getByTestId("cell:fg:background").textContent).toBe("");
    expect(screen.getByTestId("cell:bg:background").textContent).toBe(
      "background",
    );
    expect(screen.getByTestId("cell:bg:lastStep").textContent).toBe(
      "Thinking: weighing the order",
    );
  });

  it("shows a running row's clock, and how long a just-stopped one took", () => {
    subagents = known(FIXTURES);
    renderBand();

    expect(screen.getByTestId("cell:fg:started").textContent).toBe("1:14");
    // Both ways of stopping read the same: it is no longer working.
    expect(screen.getByTestId("cell:just-done:started").textContent).toBe(
      "done2:09",
    );
    expect(screen.getByTestId("cell:ended:started").textContent).toBe(
      "done3:18",
    );
  });

  it("folds the list from the summary line", () => {
    subagents = known(FIXTURES);
    renderBand();

    act(() => summaryLine().click());

    expect(screen.queryByTestId("rows")).toBeNull();
    expect(summaryLine().getAttribute("aria-expanded")).toBe("false");
    // The summary itself never leaves — it is what folds and unfolds the rows.
    expect(summaryLine().textContent).toContain("2 agents working");
  });
});
