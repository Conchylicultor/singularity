import { appendCrashSync, readAndClearBuffer } from "./buffer";
import { recordCrash } from "./record-crash";

let installed = false;

export function installProcessHooks(): void {
  if (installed) return;
  installed = true;

  process.on("uncaughtException", (err) => {
    appendCrashSync("server-uncaught", err);
    // Match Node's default behavior for uncaughtException: exit non-zero.
    // The gateway restarts us and the next boot drains the buffer.
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    appendCrashSync("server-unhandled", err);
    // Don't exit: rejections are recoverable in practice. The buffer is
    // flushed best-effort by flushBufferedCrashes below (next tick).
    void flushBufferedCrashes().catch((err) => {
      console.error("[crashes] flushBufferedCrashes failed in unhandledRejection handler", err);
    });
  });
}

// Read the JSONL buffer and run each entry through the normal recordCrash
// path. Called once on boot (from the plugin's `onReady`) and opportunistically
// after recoverable crashes.
export async function flushBufferedCrashes(): Promise<void> {
  const crashes = readAndClearBuffer();
  for (const c of crashes) {
    try {
      await recordCrash({
        source: c.source,
        errorType: c.errorType ?? null,
        message: c.message,
        stack: c.stack ?? null,
      });
    } catch (err) {
      console.error("[crashes] failed to flush buffered crash", err);
    }
  }
}
