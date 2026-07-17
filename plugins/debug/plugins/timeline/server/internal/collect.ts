import {
  runInBackgroundLane,
  runWithoutProfiling,
} from "@plugins/infra/plugins/runtime-profiler/core";
import type { TimelineFrame } from "../../shared/frames";
import { produceTimeline } from "./handle-timeline";

// In-process collection of the timeline producer's frames for the get_timeline
// MCP tool: the same fan-out handleTimeline streams as NDJSON, but pushed into
// an array instead of a socket. Wrapped in the SAME background-lane +
// profiling-suppressed guard the streaming handler uses — observability must
// never feed the profiler or ride the interactive lane (anti-amplification).
export async function collectTimeline(fromMs: number, toMs: number): Promise<TimelineFrame[]> {
  const frames: TimelineFrame[] = [];
  await runInBackgroundLane(() =>
    runWithoutProfiling(() => produceTimeline((frame) => frames.push(frame), fromMs, toMs)),
  );
  return frames;
}
