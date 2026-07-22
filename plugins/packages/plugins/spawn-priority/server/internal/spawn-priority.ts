import { dlopen } from "bun:ffi";

// macOS QoS class of GUI apps' UI threads (sys/qos.h: QOS_CLASS_USER_INTERACTIVE).
const QOS_CLASS_USER_INTERACTIVE = 0x21;

// Raise the CALLING thread to user-interactive QoS — the tier GUI apps' UI
// threads run at, ABOVE the default tier where un-demoted bulk work (tsc
// workers, builds) competes. Bun runs the event loop, HTTP handlers, and
// live-state pushes on the main thread, so one call at boot from that thread
// shields the backend's latency from default-priority load the same way the
// rest of macOS stays responsive during a build storm. No root needed — a
// process may always raise its own thread's QoS (unlike negative nice).
//
// ONLY the gateway-spawned MAIN backend may call this (gate on isMain() at the
// call site — see server-core/bin/index.ts). Boosting an agent-worktree
// backend would lift the whole fleet above its own builds and defeat priority
// isolation. Context: research/perfs/2026-07-08-host-saturation-agent-checks-starve-main.md.
//
// Fails open with a loud log: a dlopen/symbol failure on a future OS must
// degrade to default priority, never abort main's boot.
export function boostInteractiveQos(): boolean {
  if (process.platform !== "darwin") return false;
  try {
    const { symbols } = dlopen("libSystem.dylib", {
      pthread_set_qos_class_self_np: { args: ["u32", "i32"], returns: "i32" },
    });
    const rc = symbols.pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE, 0);
    if (rc !== 0) {
      console.error(`[spawn-priority] pthread_set_qos_class_self_np failed (rc=${rc}); staying at default QoS`);
      return false;
    }
    return true;
  // eslint-disable-next-line promise-safety/no-absorbed-failure -- false is a real answer ("not boosted, default QoS"), identical to the non-darwin and rc!==0 paths; documented fail-open contract above: a dlopen/symbol failure must degrade loudly (console.error) to default priority, never abort main's boot
  } catch (err) {
    console.error("[spawn-priority] QoS boost unavailable; staying at default QoS", err);
    return false;
  }
}
