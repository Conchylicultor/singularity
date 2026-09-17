import {
  MAX_ENGAGED_MS,
  stripQuery,
  type CollectBody,
  type CollectResponse,
} from "../../core";
import type { LandingSource } from "./landing";

/**
 * Everything the tracker reads from or does to the outside world, injected so
 * the logic below is plain and testable.
 */
export interface TrackerDeps {
  /** `location.host` of the page. */
  host: string;
  /** The landing URL's source, sent with the first pageview only. */
  landing: LandingSource;
  /** Posts one body. A rejection is left to surface; see `send` in instance.ts. */
  send: (body: CollectBody) => Promise<CollectResponse>;
  now: () => number;
  /** Whether the page is visible right now (`document.visibilityState`). */
  isVisible: () => boolean;
}

/** One pageview whose visible time is being counted. */
interface CurrentPage {
  path: string;
  /** Set once the pageview's response names it; null before, or if ignored. */
  pageviewId: string | null;
  /** Cumulative visible milliseconds, excluding the running stretch. */
  engagedMs: number;
  /** When the running visible stretch began, or null while hidden. */
  visibleSince: number | null;
  /** The engagedMs last sent, so a repeated hide never re-sends the same total. */
  sentMs: number;
  /** An engagement is owed but the pageview id has not arrived yet. */
  owed: boolean;
}

export interface Tracker {
  /** The route changed (or was first read). Records a pageview when the path did. */
  pathChanged: (rawPath: string) => void;
  /** The page became hidden or is being unloaded: report visible time so far. */
  hidden: () => void;
  /** The page became visible again: resume counting. */
  visible: () => void;
  /**
   * A custom event on the current page. `fallbackPath` is used before any
   * pageview was recorded (no tracker mounted).
   */
  track: (
    name: string,
    props: Record<string, string> | undefined,
    fallbackPath: string,
  ) => void;
  /** The path of the page being counted, or null before the first pageview. */
  currentPath: () => string | null;
}

/**
 * The tracker's state machine: one pageview per distinct path, the landing
 * source on the first pageview only, and visible time per pageview reported as a
 * cumulative total on every hide and when the visitor leaves the path.
 *
 * One instance per page load (see instance.ts), so remounting the React
 * component — or mounting it in two tabs of the same document — can never count
 * a path twice.
 */
export function createTracker(deps: TrackerDeps): Tracker {
  let current: CurrentPage | null = null;
  let landingSent = false;

  const engaged = (page: CurrentPage) =>
    Math.min(
      MAX_ENGAGED_MS,
      Math.round(
        page.engagedMs +
          (page.visibleSince === null ? 0 : deps.now() - page.visibleSince),
      ),
    );

  const sendEngagement = (page: CurrentPage) => {
    const engagedMs = engaged(page);
    if (engagedMs <= page.sentMs) return;
    if (page.pageviewId === null) {
      // The pageview's response is still in flight: send once it names the id.
      page.owed = true;
      return;
    }
    page.owed = false;
    page.sentMs = engagedMs;
    void deps.send({
      kind: "engagement",
      pageviewId: page.pageviewId,
      engagedMs,
    });
  };

  const pause = (page: CurrentPage) => {
    if (page.visibleSince === null) return;
    page.engagedMs += deps.now() - page.visibleSince;
    page.visibleSince = null;
  };

  return {
    pathChanged(rawPath) {
      const path = stripQuery(rawPath);
      if (current?.path === path) return;
      if (current) {
        pause(current);
        sendEngagement(current);
      }
      const page: CurrentPage = {
        path,
        pageviewId: null,
        engagedMs: 0,
        visibleSince: deps.isVisible() ? deps.now() : null,
        sentMs: 0,
        owed: false,
      };
      current = page;
      const source = landingSent ? {} : deps.landing;
      landingSent = true;
      void deps
        .send({ kind: "pageview", host: deps.host, path, ...source })
        .then((response) => {
          // `ignored` (a bot) has no id: nothing to attach engagement to.
          if (response.outcome !== "pageview") return;
          page.pageviewId = response.pageviewId;
          if (page.owed) sendEngagement(page);
        });
    },
    hidden() {
      if (!current) return;
      pause(current);
      sendEngagement(current);
    },
    visible() {
      if (!current || current.visibleSince !== null) return;
      current.visibleSince = deps.now();
    },
    track(name, props, fallbackPath) {
      void deps.send({
        kind: "event",
        host: deps.host,
        path: current?.path ?? stripQuery(fallbackPath),
        name,
        ...(props !== undefined ? { props } : {}),
      });
    },
    currentPath: () => current?.path ?? null,
  };
}
