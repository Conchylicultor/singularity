import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2, getConfig } from "@plugins/config_v2/server";
import { isMain, isRelease } from "@plugins/infra/plugins/paths/server";
import { pagingProbeConfig } from "../core";
import { startPagingProbes, stopPagingProbes } from "./internal/probe-host";

export default {
  description:
    "Twin-probe paging-victim discriminator: three main-only child processes with controlled heap shapes (lean / fat-idle / fat-touch) measure event-loop lag under host memory pressure, so divergence between them separates scheduling from cold-page-fault mechanisms. Config-gated, OFF by default; writes paging-probe-<variant>.jsonl.",
  contributions: [ConfigV2.Register({ descriptor: pagingProbeConfig })],
  // Main-only (main is the victim under test) and NEVER in a compiled release
  // (a release is a shipped composition, not a diagnostics host — unlike the
  // sentinel, which must run on releases too). Off unless explicitly enabled:
  // the fat variants allocate real cold heap, so this is an experiment switch.
  onReady: () => {
    if (!isMain() || isRelease()) return;
    if (!getConfig(pagingProbeConfig).enabled) return;
    startPagingProbes();
  },
  onShutdown: () => {
    stopPagingProbes();
  },
} satisfies ServerPluginDefinition;
