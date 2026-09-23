import { describe, expect, it } from "bun:test";
import type {
  PrototypeOption,
  PrototypeVersion,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import {
  canvasReducer,
  frameA,
  initialCanvasState,
  prototypeFrames,
  type CanvasAction,
  type CanvasState,
  type PrototypeFrame,
} from "./canvas-model";

const design: PrototypeOption = {
  name: "design",
  values: ["mist", "slate", "paper"],
  default: "mist",
};

const v3: PrototypeVersion = {
  n: 3,
  sha: "abc",
  at: "2026-09-20T00:00:00Z",
  kind: "turn",
  subject: "Try avatars",
  conversationId: null,
  messageId: null,
  options: [],
};

function run(
  state: CanvasState,
  action: CanvasAction,
  shared: Record<string, string> = {},
) {
  return canvasReducer(state, action, shared);
}

function proto(state: CanvasState, index: number): PrototypeFrame {
  const f = prototypeFrames(state.frames)[index];
  if (!f) throw new Error(`no prototype frame ${String(index)}`);
  return f;
}

describe("initialCanvasState", () => {
  it("opens on frame A alone, holding the shared picks", () => {
    const s = initialCanvasState();
    expect(s.frames).toEqual([
      { id: 1, kind: "prototype", version: null, picks: "shared" },
    ]);
    expect(s.selected).toBe(1);
  });

  it("puts a source beside A when asked", () => {
    const s = initialCanvasState({ source: "real-app" });
    expect(s.frames.map((f) => f.kind)).toEqual(["prototype", "source"]);
  });
});

describe("addPrototype", () => {
  it("copies the last prototype frame, snapshotting the shared picks", () => {
    const s0 = run(initialCanvasState({ version: v3 }), {
      type: "setVersion",
      id: 1,
      version: v3,
    }).state;
    const { state, effects } = run(
      s0,
      { type: "addPrototype" },
      { design: "slate" },
    );
    expect(effects).toEqual([]);
    const b = proto(state, 1);
    expect(b.picks).toEqual({ design: "slate" });
    expect(b.version).toBe(v3);
    expect(state.selected).toBe(b.id);
    // A still reads the shared record.
    expect(proto(state, 0).picks).toBe("shared");
  });

  it("duplicates the named frame", () => {
    let s = run(initialCanvasState(), { type: "addPrototype" }).state;
    s = run(s, {
      type: "setPick",
      id: 2,
      option: "design",
      value: "paper",
    }).state;
    s = run(s, { type: "addPrototype", from: 1 }, { design: "slate" }).state;
    expect(proto(s, 2).picks).toEqual({ design: "slate" });
  });

  it("makes a new frame A when only sources are left", () => {
    let s = initialCanvasState({ source: "real-app" });
    s = run(s, { type: "keepOnly", id: 2 }).state;
    const { state } = run(s, { type: "addPrototype" });
    expect(frameA(state.frames)?.picks).toBe("shared");
  });
});

describe("addSource", () => {
  it("adds a source once", () => {
    let s = run(initialCanvasState(), {
      type: "addSource",
      source: "real-app",
    }).state;
    s = run(s, { type: "addSource", source: "real-app" }).state;
    expect(s.frames.filter((f) => f.kind === "source")).toHaveLength(1);
  });
});

describe("picks", () => {
  it("writes frame A's pick to the shared record, a local frame's in place", () => {
    const s = run(initialCanvasState(), { type: "addPrototype" }).state;
    const a = run(s, {
      type: "setPick",
      id: 1,
      option: "design",
      value: "paper",
    });
    expect(a.effects).toEqual([
      { kind: "setShared", option: "design", value: "paper" },
    ]);
    const b = run(s, {
      type: "setPick",
      id: 2,
      option: "design",
      value: "paper",
    });
    expect(b.effects).toEqual([]);
    expect(proto(b.state, 1).picks).toEqual({ design: "paper" });
  });

  it("fans a linked option out to every prototype frame", () => {
    let s = run(initialCanvasState(), { type: "addPrototype" }).state;
    s = run(s, { type: "toggleLink", id: 2, option: design }).state;
    const { state, effects } = run(s, {
      type: "setPick",
      id: 2,
      option: "design",
      value: "slate",
    });
    expect(proto(state, 1).picks).toEqual({ design: "slate" });
    expect(effects).toEqual([
      { kind: "setShared", option: "design", value: "slate" },
    ]);
  });

  it("linking copies the linking frame's value everywhere", () => {
    let s = run(initialCanvasState(), { type: "addPrototype" }).state;
    s = run(s, {
      type: "setPick",
      id: 2,
      option: "design",
      value: "paper",
    }).state;
    const { state, effects } = run(s, {
      type: "toggleLink",
      id: 2,
      option: design,
    });
    expect(state.linked.has("design")).toBe(true);
    expect(effects).toEqual([
      { kind: "setShared", option: "design", value: "paper" },
    ]);
    const unlinked = run(state, {
      type: "toggleLink",
      id: 2,
      option: design,
    }).state;
    expect(unlinked.linked.has("design")).toBe(false);
  });
});

describe("spread", () => {
  it("spreads one frame per value, keeping the base frame, and gathers back", () => {
    const s = initialCanvasState({ source: "real-app" });
    const { state, effects } = run(
      s,
      { type: "toggleSpread", id: 1, option: design },
      { design: "slate" },
    );
    expect(state.spread).toBe("design");
    const protos = prototypeFrames(state.frames);
    expect(protos.map((f) => f.id)).toEqual([3, 1, 4]);
    expect(state.frames.at(-1)?.kind).toBe("source");
    // Frame 3 (Mist) is first, so it is A now: its picks became the shared
    // record, and the base kept what it showed as its own.
    expect(frameA(state.frames)?.id).toBe(3);
    expect(protos[0]!.picks).toBe("shared");
    expect(effects).toEqual([
      { kind: "replaceShared", picks: { design: "mist" } },
    ]);
    expect(protos[1]!.picks).toEqual({ design: "slate" });

    const back = run(
      state,
      { type: "toggleSpread", id: 1, option: design },
      { design: "mist" },
    );
    expect(back.state.spread).toBeNull();
    expect(back.state.frames.map((f) => f.id)).toEqual([1, 2]);
    expect(proto(back.state, 0).picks).toBe("shared");
    expect(back.effects).toEqual([
      { kind: "replaceShared", picks: { design: "slate" } },
    ]);
  });

  it("a pick on the spread option ends the spread", () => {
    let s = run(initialCanvasState(), {
      type: "toggleSpread",
      id: 1,
      option: design,
    }).state;
    s = run(s, {
      type: "setPick",
      id: 1,
      option: "design",
      value: "paper",
    }).state;
    expect(s.spread).toBeNull();
  });
});

describe("remove and keepOnly", () => {
  it("never removes the last frame", () => {
    const s = initialCanvasState();
    expect(run(s, { type: "remove", id: 1 }).state).toBe(s);
  });

  it("promotes the next prototype frame to A, writing its picks to the shared record", () => {
    let s = run(initialCanvasState(), { type: "addPrototype" }).state;
    s = run(s, {
      type: "setPick",
      id: 2,
      option: "design",
      value: "paper",
    }).state;
    const { state, effects } = run(s, { type: "remove", id: 1 });
    expect(proto(state, 0)).toMatchObject({ id: 2, picks: "shared" });
    expect(effects).toEqual([
      { kind: "replaceShared", picks: { design: "paper" } },
    ]);
    expect(state.selected).toBe(2);
  });

  it("keeps one frame, and Undo puts the canvas and the shared record back", () => {
    let s = run(initialCanvasState({ source: "real-app" }), {
      type: "addPrototype",
    }).state;
    s = run(s, { type: "setLayout", layout: "swipe" }).state;
    const before = s;
    const kept = run(s, { type: "keepOnly", id: 3 }, { design: "slate" });
    expect(kept.state.frames.map((f) => f.id)).toEqual([3]);
    expect(kept.state.layout).toBe("side");
    const undone = run(kept.state, {
      type: "restore",
      state: before,
      shared: { design: "slate" },
    });
    expect(undone.state).toBe(before);
    expect(undone.effects).toEqual([
      { kind: "replaceShared", picks: { design: "slate" } },
    ]);
  });
});

describe("canvas-wide settings", () => {
  it("clamps the swipe divider", () => {
    const s = run(initialCanvasState(), { type: "setSwipeAt", at: 3 }).state;
    expect(s.swipeAt).toBe(1);
  });
});
