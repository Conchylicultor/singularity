import { describe, expect, it } from "vitest";
import type { CollectBody, CollectResponse } from "../../core";
import { landingSource } from "../internal/landing";
import { isWithinApp } from "../internal/scope";
import { createTracker, type TrackerDeps } from "../internal/tracker";

const PV_A = "00000000-0000-4000-8000-00000000000a";
const PV_B = "00000000-0000-4000-8000-00000000000b";

/** A tracker over a fake clock and a recording send whose responses the test releases. */
function harness(opts: { landing?: TrackerDeps["landing"] } = {}) {
  let clock = 0;
  let visible = true;
  const sent: CollectBody[] = [];
  const pending: ((r: CollectResponse) => void)[] = [];
  const tracker = createTracker({
    host: "equin.dev",
    landing: opts.landing ?? {},
    send: (body) => {
      sent.push(body);
      return new Promise((resolve) => pending.push(resolve));
    },
    now: () => clock,
    isVisible: () => visible,
  });
  return {
    tracker,
    sent,
    advance: (ms: number) => {
      clock += ms;
    },
    setVisible: (v: boolean) => {
      visible = v;
    },
    /** Answers the `index`-th send, then lets its `.then` run. */
    respond: async (index: number, response: CollectResponse) => {
      const resolve = pending[index];
      if (!resolve) throw new Error(`no send #${index}`);
      resolve(response);
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe("pageviews", () => {
  it("records one pageview per distinct path, query stripped", () => {
    const h = harness();
    h.tracker.pathChanged("/website");
    h.tracker.pathChanged("/website?x=1");
    h.tracker.pathChanged("/website");
    h.tracker.pathChanged("/website/story");
    expect(h.sent.filter((b) => b.kind === "pageview")).toEqual([
      { kind: "pageview", host: "equin.dev", path: "/website" },
      { kind: "pageview", host: "equin.dev", path: "/website/story" },
    ]);
  });

  it("sends the landing source with the first pageview only", () => {
    const landing = {
      referrer: "https://news.ycombinator.com/item?id=1",
      utm: { source: "hn" },
    };
    const h = harness({ landing });
    h.tracker.pathChanged("/website");
    h.tracker.pathChanged("/website/story");
    expect(h.sent[0]).toEqual({
      kind: "pageview",
      host: "equin.dev",
      path: "/website",
      ...landing,
    });
    expect(h.sent[1]).toEqual({
      kind: "pageview",
      host: "equin.dev",
      path: "/website/story",
    });
  });
});

describe("engagement", () => {
  it("reports cumulative visible time on hide, excluding hidden stretches", async () => {
    const h = harness();
    h.tracker.pathChanged("/website");
    await h.respond(0, { outcome: "pageview", pageviewId: PV_A });
    h.advance(1000);
    h.tracker.hidden();
    h.setVisible(false);
    h.advance(50_000);
    h.setVisible(true);
    h.tracker.visible();
    h.advance(500);
    h.tracker.hidden();
    expect(h.sent.slice(1)).toEqual([
      { kind: "engagement", pageviewId: PV_A, engagedMs: 1000 },
      { kind: "engagement", pageviewId: PV_A, engagedMs: 1500 },
    ]);
  });

  it("does not re-send an unchanged total (visibilitychange then pagehide)", async () => {
    const h = harness();
    h.tracker.pathChanged("/website");
    await h.respond(0, { outcome: "pageview", pageviewId: PV_A });
    h.advance(700);
    h.tracker.hidden();
    h.tracker.hidden();
    expect(h.sent.filter((b) => b.kind === "engagement")).toHaveLength(1);
  });

  it("reports the previous page's time when the path changes", async () => {
    const h = harness();
    h.tracker.pathChanged("/website");
    await h.respond(0, { outcome: "pageview", pageviewId: PV_A });
    h.advance(2000);
    h.tracker.pathChanged("/website/story");
    expect(h.sent.slice(1)).toEqual([
      { kind: "engagement", pageviewId: PV_A, engagedMs: 2000 },
      { kind: "pageview", host: "equin.dev", path: "/website/story" },
    ]);
    await h.respond(2, { outcome: "pageview", pageviewId: PV_B });
    h.advance(300);
    h.tracker.hidden();
    expect(h.sent[3]).toEqual({
      kind: "engagement",
      pageviewId: PV_B,
      engagedMs: 300,
    });
  });

  it("holds an engagement until the pageview id arrives", async () => {
    const h = harness();
    h.tracker.pathChanged("/website");
    h.advance(400);
    h.tracker.hidden();
    expect(h.sent).toHaveLength(1);
    await h.respond(0, { outcome: "pageview", pageviewId: PV_A });
    expect(h.sent[1]).toEqual({
      kind: "engagement",
      pageviewId: PV_A,
      engagedMs: 400,
    });
  });

  it("sends no engagement for an ignored pageview", async () => {
    const h = harness();
    h.tracker.pathChanged("/website");
    h.advance(400);
    h.tracker.hidden();
    await h.respond(0, { outcome: "ignored", reason: "bot" });
    expect(h.sent).toHaveLength(1);
  });

  it("does not count time while the page started hidden", async () => {
    const h = harness();
    h.setVisible(false);
    h.tracker.pathChanged("/website");
    await h.respond(0, { outcome: "pageview", pageviewId: PV_A });
    h.advance(10_000);
    h.tracker.hidden();
    expect(h.sent).toHaveLength(1);
  });
});

describe("events", () => {
  it("attributes an event to the tracked page, else the fallback path", () => {
    const h = harness();
    h.tracker.track("improve_open", undefined, "/website?q=1");
    h.tracker.pathChanged("/website/story");
    h.tracker.track("improve_show_me", { step: "1" }, "/ignored");
    expect(h.sent.filter((b) => b.kind === "event")).toEqual([
      {
        kind: "event",
        host: "equin.dev",
        path: "/website",
        name: "improve_open",
      },
      {
        kind: "event",
        host: "equin.dev",
        path: "/website/story",
        name: "improve_show_me",
        props: { step: "1" },
      },
    ]);
  });
});

describe("landingSource", () => {
  it("keeps an external referrer and the utm tags", () => {
    expect(
      landingSource({
        referrer: "https://www.google.com/",
        search: "?utm_source=news&utm_campaign=%20launch%20&other=1",
        siteHost: "equin.dev",
      }),
    ).toEqual({
      referrer: "https://www.google.com/",
      utm: { source: "news", campaign: "launch" },
    });
  });

  it("drops a same-site, empty or unparseable referrer", () => {
    for (const referrer of ["", "https://equin.dev/website", "not a url"]) {
      expect(
        landingSource({ referrer, search: "", siteHost: "equin.dev" }),
      ).toEqual({});
    }
  });
});

describe("isWithinApp", () => {
  it("matches the base path and its sub-paths only", () => {
    expect(isWithinApp("/website", "/website")).toBe(true);
    expect(isWithinApp("/website/story", "/website")).toBe(true);
    expect(isWithinApp("/websites", "/website")).toBe(false);
    expect(isWithinApp("/agents", "/website")).toBe(false);
  });
});
