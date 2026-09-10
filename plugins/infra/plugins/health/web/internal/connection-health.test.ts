import { describe, expect, test } from "bun:test";
import { connectionHealth } from "./connection-health";

describe("connectionHealth", () => {
  test("both sockets open is ok", () => {
    expect(connectionHealth({ worktree: "open", central: "open" })).toEqual({
      state: "ok",
      summary: "Server and central connected",
    });
  });

  test("a closed socket is critical and names which", () => {
    expect(connectionHealth({ worktree: "closed", central: "open" })).toEqual({
      state: "critical",
      summary: "Server disconnected",
    });
    expect(connectionHealth({ worktree: "open", central: "closed" })).toEqual({
      state: "critical",
      summary: "Central disconnected",
    });
    expect(connectionHealth({ worktree: "closed", central: "closed" })).toEqual(
      { state: "critical", summary: "Server and central disconnected" },
    );
  });

  test("closed outranks the other socket reconnecting", () => {
    expect(
      connectionHealth({ worktree: "reconnecting", central: "closed" }),
    ).toEqual({ state: "critical", summary: "Central disconnected" });
  });

  test("a (re)connecting socket is attention, transitioning, and names which", () => {
    expect(
      connectionHealth({ worktree: "reconnecting", central: "open" }),
    ).toEqual({
      state: "attention",
      summary: "Reconnecting to server…",
      transitioning: true,
    });
    expect(
      connectionHealth({ worktree: "open", central: "connecting" }),
    ).toEqual({
      state: "attention",
      summary: "Connecting to central…",
      transitioning: true,
    });
  });

  test("both sockets on the way back share one verb when they can", () => {
    expect(
      connectionHealth({ worktree: "reconnecting", central: "reconnecting" }),
    ).toEqual({
      state: "attention",
      summary: "Reconnecting to server and central…",
      transitioning: true,
    });
    expect(
      connectionHealth({ worktree: "reconnecting", central: "connecting" }),
    ).toEqual({
      state: "attention",
      summary: "Reconnecting to server, connecting to central…",
      transitioning: true,
    });
  });
});
