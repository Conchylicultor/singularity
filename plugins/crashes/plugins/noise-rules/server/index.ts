import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { CrashNoiseRule } from "@plugins/crashes/server";

export default {
  description:
    "Built-in noise classification rules for low-signal crashes (e.g. ResizeObserver loop warnings).",
  contributions: [
    CrashNoiseRule({
      id: "resize-observer",
      matches: ({ message, errorType }) =>
        message.toLowerCase().includes("resizeobserver") ||
        (errorType?.toLowerCase().includes("resizeobserver") ?? false),
    }),
    // A one-shot `claude --print` exiting 143/137 means the subprocess was
    // killed by a signal (SIGTERM/SIGKILL) — server restart during build, or
    // our own timeout `proc.kill()`. Not a real failure, just an interrupted
    // throwaway generation. Mute so shutdowns don't spam crash tasks.
    CrashNoiseRule({
      id: "claude-cli-signal-kill",
      matches: ({ errorType, message }) =>
        errorType === "ClaudeCliError" &&
        /claude --print exited (?:143|137)\b/.test(message),
    }),
    // A crash whose originating frontend tab is running an obsolete bundle
    // (build id mismatch). Benign version-skew during a rollout, not a live
    // bug — mute the notification but still record + file the (attributed) task.
    CrashNoiseRule({
      id: "stale-frontend",
      matches: (i) => i.staleOrigin === true,
    }),
  ],
} satisfies ServerPluginDefinition;
