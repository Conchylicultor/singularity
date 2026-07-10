import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdTimeline } from "react-icons/md";
import { SlowEvents } from "@plugins/debug/plugins/trace/plugins/pane/web";
import { TimelineView } from "./components/timeline-view";

export default {
  description:
    "Timeline tab for the Slow Events pane: the unified cross-worktree wall-clock Gantt — per-worktree lanes of traces / slow-ops / reports / builds / boots with health heat strips and cross-worktree incident bands, streamed pull-only from the timeline endpoint.",
  contributions: [
    SlowEvents.View({
      id: "timeline",
      title: "Timeline",
      icon: MdTimeline,
      order: 40,
      component: TimelineView,
    }),
  ],
} satisfies PluginDefinition;
