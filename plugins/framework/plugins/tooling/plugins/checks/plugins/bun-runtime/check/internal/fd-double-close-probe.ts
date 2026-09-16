/**
 * Does THIS Bun close a finished child's extra stdio fd a second time?
 *
 * Run as its own process, by the `bun-runtime` check, under the very Bun the
 * repo is about to trust. It is deliberately dependency-free — no repo imports,
 * no aliases — so it probes the runtime and nothing else, and so it can be run
 * by hand against any bun binary: `<bun> <this file>`.
 *
 * One round: spawn a child holding an extra stdio pipe, close the fd number the
 * caller was handed, open a live unix socket (which takes the lowest free
 * number, i.e. the one just freed), then drop the child object and force a
 * garbage collection. On a Bun with the defect the sweep closes that number
 * again and the live socket dies silently — no error, no close event — so the
 * round checks it two ways: the fd still exists, and the socket still echoes.
 *
 * Upstream: oven-sh/bun#33828, "Bun.spawn: don't double-close extra stdio fds
 * exposed via .stdio", merged 2026-07-10 and first shipped in 1.4.0. Every Bun
 * up to and including 1.3.14 fails, deterministically, in round 2.
 *
 * Exit codes are the whole protocol, because the caller must be able to tell a
 * detected defect from a probe that could not run:
 *   0 — clean
 *   3 — DEFECT: a live socket was killed
 *   anything else — the probe itself broke; the caller reports inconclusive
 */
import { closeSync, fstatSync, mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Detection is deterministic in round 2; the rest is margin, and costs ~0.4 s. */
const ROUNDS = 12;

/** Far above a loopback echo on an idle box; only a dead socket takes this long. */
const ECHO_TIMEOUT_MS = 1_000;

const EXIT_CLEAN = 0;
const EXIT_DEFECT = 3;

const dir = mkdtempSync(join(tmpdir(), "bun-fd-probe-"));
const socketPath = join(dir, "echo.sock");

/**
 * The last line on stdout is the probe's verdict in words, and the exit code is
 * the same verdict for the caller — written straight to the stream because it
 * is this process's output contract, not logging. (The structured logger is
 * also unreachable here by design: the probe imports nothing.)
 */
function finish(code: number, line: string): never {
  rmSync(dir, { recursive: true, force: true });
  process.stdout.write(`${line}\n`);
  process.exit(code);
}

const server = net
  .createServer((connection) =>
    connection.on("data", (d) => connection.write(d)),
  )
  .listen(socketPath);
await new Promise((resolve) => server.once("listening", resolve));

for (let round = 1; round <= ROUNDS; round++) {
  // The one raw Bun.spawn in the repo that WANTS an extra stdio pipe: slot 3 is
  // the whole point of the probe. Exempted by path in spawn-safety's ignores.
  let child: Bun.Subprocess | null = Bun.spawn({
    cmd: ["/bin/sh", "-c", "printf hi >&3"],
    stdio: ["ignore", "ignore", "ignore", "pipe"],
  });
  await child.exited;

  // The caller owns the fd it was handed, and closes it exactly once. Anything
  // that closes this number again from here on is closing someone else's.
  const freed = child.stdio[3] as number;
  closeSync(freed);

  const socket = net.createConnection(socketPath);
  await new Promise((resolve) => socket.once("connect", resolve));
  const fd = (socket as unknown as { _handle: { fd: number } })._handle.fd;

  child = null;
  Bun.gc(true);
  await Bun.sleep(0);
  Bun.gc(true);

  let stat = "ok";
  try {
    fstatSync(fd);
  } catch (err) {
    stat = (err as { code?: string }).code ?? String(err);
  }

  socket.write("ping");
  const echo = await Promise.race([
    new Promise((resolve) => socket.once("data", () => resolve("echoed"))),
    Bun.sleep(ECHO_TIMEOUT_MS).then(() => "no echo"),
  ]);

  if (stat !== "ok" || echo !== "echoed") {
    finish(
      EXIT_DEFECT,
      `Bun ${Bun.version} closed a live socket it did not own, in round ${round}. ` +
        `The socket took fd ${fd}, the number this process had already freed (${freed}), ` +
        `and after the child's garbage collection the fd reads back "${stat}" and the socket says "${echo}".`,
    );
  }
  socket.destroy();
}

finish(
  EXIT_CLEAN,
  `Bun ${Bun.version} left every live socket alone across ${ROUNDS} rounds.`,
);
