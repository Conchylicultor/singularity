import type { TimelineEvent } from "../../core";
import type { TimelineWindow } from "./view-model";

// ---------------------------------------------------------------------------
// Incident-band derivation. The transitive time-overlap grouping itself is the
// trace pane's exported `groupIncidents` (the sweep-union both its Events list
// and this tab share); these pure helpers only adapt TimelineEvents to its
// input shape and reduce its per-event output to one band per incident. They
// take the resulting Map as a parameter (structural IncidentInfoLike) so this
// module stays React/barrel-free and bun-testable.
// ---------------------------------------------------------------------------

/** groupIncidents' input shape: an interval as (end wallTime, span). */
export interface IncidentInput {
  id: string;
  wallTime: string;
  windowSpanMs: number;
}

/** Structural twin of the trace pane's IncidentInfo. */
export interface IncidentInfoLike {
  incidentId: number;
  size: number;
  colorIndex: number;
}

/** One cross-worktree incident: the union extent of its member events. */
export interface IncidentBand {
  incidentId: number;
  colorIndex: number;
  size: number;
  /** Window-relative ms. */
  startMs: number;
  endMs: number;
}

/**
 * An incident member must be a plausible single event: hours-wide intervals
 * (e.g. historical op-time traces whose window was widened by an aggregate
 * count×cost duration — origin-fixed in op-rate 2026-07-10, but persisted
 * traces live out their 7-day retention) are context, not correlation, and
 * one of them chains everything it touches into a single mega-incident.
 */
export const MAX_INCIDENT_MEMBER_SPAN_MS = 30 * 60_000;

/**
 * Incident-membership candidates: interval events only — a point event
 * (startMs === endMs) is not an incident member, and neither is an interval
 * wider than MAX_INCIDENT_MEMBER_SPAN_MS (still rendered as a bar, just
 * excluded from band grouping). Duress episodes are also excluded: they get
 * their own dedicated band (duressBands), and being host-global they would
 * chain every event they overlap into one mega-incident.
 */
export function intervalEvents(events: TimelineEvent[]): TimelineEvent[] {
  return events.filter(
    (ev) =>
      ev.source !== "duress" &&
      ev.endMs > ev.startMs &&
      ev.endMs - ev.startMs <= MAX_INCIDENT_MEMBER_SPAN_MS,
  );
}

/** One duress episode as a window-relative cross-lane band. */
export interface DuressBand {
  /** The source event's id (doubles as the detail-strip selection key). */
  id: string;
  /** Window-relative ms. */
  startMs: number;
  endMs: number;
  label: string;
  /** Possibly still live at the window edge (renders open / pulsing). */
  open: boolean;
  /** Lapsed with no clear line — the end time is a bound, not a fact. */
  endUnknown: boolean;
}

/**
 * Duress episodes → cross-lane bands, clipped to the window. One band per
 * event, no grouping — the episode itself IS the annotation ("the record was
 * thinned here": shed slow-ops/reports inside it are expected to be sparse).
 */
export function duressBands(events: TimelineEvent[], range: TimelineWindow): DuressBand[] {
  const out: DuressBand[] = [];
  for (const ev of events) {
    if (ev.source !== "duress") continue;
    const startMs = Math.max(ev.startMs, range.fromMs) - range.fromMs;
    const endMs = Math.min(ev.endMs, range.toMs) - range.fromMs;
    if (endMs <= startMs) continue;
    out.push({
      id: ev.id,
      startMs,
      endMs,
      label: ev.label,
      open: ev.detail["open"] === true,
      endUnknown: ev.detail["endUnknown"] === true,
    });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/**
 * Adapts interval events to groupIncidents' input. Ids are the array index —
 * source event ids can collide across worktrees, and the caller reads the
 * result map back with the same indices (see buildBands).
 */
export function incidentInputs(events: TimelineEvent[]): IncidentInput[] {
  return events.map((ev, i) => ({
    id: String(i),
    wallTime: new Date(ev.endMs).toISOString(),
    windowSpanMs: ev.endMs - ev.startMs,
  }));
}

/**
 * Reduces per-event incident info to one band per multi-event incident
 * (size ≥ 2 — a solo event is not cross-event correlation), spanning the union
 * of its members' intervals, clipped to the window. `events` MUST be the same
 * array `incidentInputs` was called with (index-keyed ids).
 */
export function buildBands(
  events: TimelineEvent[],
  infoById: Map<string, IncidentInfoLike>,
  range: TimelineWindow,
): IncidentBand[] {
  const byIncident = new Map<number, IncidentBand>();
  events.forEach((ev, i) => {
    const info = infoById.get(String(i));
    if (!info || info.size < 2) return;
    const startMs = Math.max(ev.startMs, range.fromMs) - range.fromMs;
    const endMs = Math.min(ev.endMs, range.toMs) - range.fromMs;
    if (endMs <= startMs) return;
    const band = byIncident.get(info.incidentId);
    if (band) {
      band.startMs = Math.min(band.startMs, startMs);
      band.endMs = Math.max(band.endMs, endMs);
    } else {
      byIncident.set(info.incidentId, {
        incidentId: info.incidentId,
        colorIndex: info.colorIndex,
        size: info.size,
        startMs,
        endMs,
      });
    }
  });
  return [...byIncident.values()].sort((a, b) => a.startMs - b.startMs);
}
