// Minimal repro for: event loop wedges at 100% CPU in a native microtask storm
// after Bun.spawn children with piped stdio exit while stream pulls are pending.
// Field signature (bun 1.3.13, macOS ARM64): processTicksAndRejections (FTL) spends
// ~all time in drainMicrotasks(); the queue is refilled with native promise-reaction
// jobs forever; kqueue backlog (100+ undrained events); children zombify unreaped.
//
// Usage:
//   bun repro.mjs                     # driver: spawns worker bun processes, watches for wedge
//   bun repro.mjs --workers 6 --duration 480 --out /tmp/wedge-repro
//   bun repro.mjs --child bun         # fast-exit children are bun processes (heavier, closer to #27766)
//   bun repro.mjs --service           # + long-lived chatty service child per worker; SIGKILL heavy writers mid-transfer
//   bun repro.mjs --worker            # internal: churn loop (started by the driver)
//
// Exit codes: 0 = ran to completion without wedging, 2 = WEDGE DETECTED (sample saved,
// wedged pid left alive for inspection).
//
// Status 2026-07-22: three 8-min runs on the affected host (plain / oversubscribed
// bun children / service+SIGKILL) did NOT reproduce — the field race is rarer than
// pure churn reaches in minutes. Intended as a soak harness (run for hours) and as
// an executable description of the suspected mechanism.

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};

// ---------------------------------------------------------------- worker mode
// Each iteration races child exit against pending piped-stdio pulls:
//  - burst of very-short-lived children whose stdout is read via ReadableStream
//  - plus children killed a few ms after spawn, mid-pull
if (args.includes("--worker")) {
  const CONCURRENCY = flag("concurrency", 8);
  // --child bun: fast-exit children are bun processes (closer to oven-sh/bun#27766)
  const BUN_CHILD = args.includes("--child") && args[args.indexOf("--child") + 1] === "bun";
  const fastCmd = BUN_CHILD
    ? [process.execPath, "-e", "console.log('y'.repeat(512))"]
    : ["/bin/echo", "y".repeat(512)];
  let ops = 0;
  // --service: keep one long-lived chatty child (persistent piped stream with
  // continuous pulls, like a bundler service process) alive while churning.
  if (args.includes("--service")) {
    const svc = Bun.spawn(
      [process.execPath, "-e", "setInterval(() => console.log('svc'.repeat(200)), 20)"],
      { stdout: "pipe", stderr: "pipe" },
    );
    void (async () => {
      const reader = (svc.stdout).getReader();
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
      }
    })();
  }
  const read = async (p) => {
    const [out] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited,
    ]);
    return out;
  };
  while (true) {
    const batch = Array.from({ length: CONCURRENCY }, (_, i) => {
      if (i % 2 === 0) {
        // fast-exit child: exit races the first pull
        const p = Bun.spawn(fastCmd, { stdout: "pipe", stderr: "pipe" });
        return read(p);
      }
      // child killed mid-pull: exit is guaranteed to race a pending pull.
      // With --service the victim writes heavily so SIGKILL lands mid-transfer.
      const p = args.includes("--service")
        ? Bun.spawn([process.execPath, "-e", "for(;;) console.log('x'.repeat(4096))"], { stdout: "pipe", stderr: "pipe" })
        : Bun.spawn(["/bin/sleep", "5"], { stdout: "pipe", stderr: "pipe" });
      const reading = read(p);
      setTimeout(() => p.kill("SIGKILL"), Math.floor(Math.random() * 6));
      return reading;
    });
    await Promise.all(batch);
    ops += CONCURRENCY;
    if (ops % (CONCURRENCY * 5) === 0) console.log(`hb ${ops}`); // heartbeat -> driver
  }
}

// ---------------------------------------------------------------- driver mode
const WORKERS = flag("workers", 6);
const DURATION_S = flag("duration", 480);
const STALL_S = 25; // no heartbeat for this long + high CPU => wedged
const outIdx = args.indexOf("--out");
const OUT = outIdx >= 0 ? args[outIdx + 1] : "/tmp/bun-wedge-repro";
await Bun.$`mkdir -p ${OUT}`.quiet();

console.log(`bun ${Bun.version} on ${process.platform}/${process.arch}`);
console.log(`driver: ${WORKERS} workers, ${DURATION_S}s max, results in ${OUT}`);


const workers = [];
for (let id = 0; id < WORKERS; id++) {
  const passThrough = args.filter((a, i) => {
    const prev = args[i - 1];
    return a === "--child" || prev === "--child" || a === "--concurrency" || prev === "--concurrency" || a === "--service";
  });
  const proc = Bun.spawn([process.execPath, import.meta.path, "--worker", ...passThrough], {
    stdout: "pipe",
    stderr: "inherit",
  });
  const w = { proc, lastHb: Date.now(), ops: 0, id };
  workers.push(w);
  void (async () => {
    // consume heartbeats
    const reader = (proc.stdout).getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value);
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        const m = /^hb (\d+)/.exec(line);
        if (m) {
          w.lastHb = Date.now();
          w.ops = Number(m[1]);
        }
      }
    }
  })();
}

const killAll = () => {
  for (const w of workers) try { w.proc.kill("SIGKILL"); } catch {}
};
process.on("SIGINT", () => { killAll(); process.exit(130); });

const cpuOf = async (pids) => {
  const out = await Bun.$`ps -o pid=,pcpu= -p ${pids.join(",")}`.nothrow().text();
  const map = new Map();
  for (const line of out.trim().split("\n")) {
    const [pid, cpu] = line.trim().split(/\s+/);
    if (pid) map.set(Number(pid), Number(cpu));
  }
  return map;
};

const t0 = Date.now();
while (Date.now() - t0 < DURATION_S * 1000) {
  await Bun.sleep(5000);
  const cpu = await cpuOf(workers.map((w) => w.proc.pid));
  const now = Date.now();
  const status = workers
    .map((w) => `#${w.id}:${w.ops}ops/${cpu.get(w.proc.pid) ?? "?"}%`)
    .join(" ");
  console.log(`[${Math.round((now - t0) / 1000)}s] ${status}`);
  for (const w of workers) {
    const stalledS = (now - w.lastHb) / 1000;
    const pct = cpu.get(w.proc.pid) ?? 0;
    if (stalledS > STALL_S && pct > 70) {
      console.log(
        `\nWEDGE DETECTED: worker #${w.id} pid=${w.proc.pid} — no heartbeat for ${stalledS.toFixed(0)}s at ${pct}% CPU`,
      );
      console.log(`sampling (10s) -> ${OUT}/wedged-${w.proc.pid}.sample.txt ...`);
      await Bun.$`sample ${w.proc.pid} 10 -file ${OUT}/wedged-${w.proc.pid}.sample.txt`.nothrow().quiet();
      await Bun.$`ps -o pid,ppid,stat,pcpu,etime,command -p ${w.proc.pid}`.nothrow();
      // leave the wedged pid ALIVE for inspection; kill the rest
      for (const o of workers) if (o !== w) try { o.proc.kill("SIGKILL"); } catch {}
      console.log(`wedged worker pid ${w.proc.pid} left running for inspection (kill it when done).`);
      process.exit(2);
    }
  }
}

killAll();
const total = workers.reduce((s, w) => s + w.ops, 0);
console.log(`\nno wedge in ${DURATION_S}s (${total} spawn-batches completed). Re-run or raise --duration/--workers.`);
process.exit(0);
