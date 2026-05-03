import parcel from "@parcel/watcher";
import { gitCommonDir } from "./git-common-dir";
import { readSha } from "./read-sha";
import { refAdvanced } from "./tables-ref-advanced";
import { refHeadResource } from "./ref-head-resource";

const DEBOUNCE_MS = 100;
const CEILING_MS = 1000;
const RECONCILE_INTERVAL_MS = 30_000;

// v1 only tracks refs/heads/main; the API supports more refs but no consumer
// requires per-subscription dynamic registration yet.
const TRACKED_REFS: ReadonlyArray<string> = ["refs/heads/main"];

const lastKnownSha = new Map<string, string | null>();
let subscriptions: parcel.AsyncSubscription[] = [];
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let ceilingTimer: ReturnType<typeof setTimeout> | null = null;
let reconcileTimer: ReturnType<typeof setInterval> | null = null;
let lastRecomputeAt = 0;
let started = false;

export async function startGitWatcher(): Promise<void> {
  if (started) return;
  started = true;

  let commonDir: string;
  try {
    commonDir = await gitCommonDir();
  } catch (err) {
    console.error("[git-watcher] cannot resolve git common dir", err);
    return;
  }

  // Seed lastKnownSha without emitting — the watcher's contract is "fire on
  // advance from a known baseline." Consumers run their own startup catch-up
  // for "did anything change while I was down."
  for (const ref of TRACKED_REFS) {
    try {
      lastKnownSha.set(ref, await readSha(ref));
    } catch (err) {
      console.error(`[git-watcher] initial readSha(${ref}) failed`, err);
      lastKnownSha.set(ref, null);
    }
  }

  // Watch refs/heads/ (loose refs) and the .git root (packed-refs +
  // HEAD-style files). parcel.subscribe is recursive; we filter at recompute
  // time by re-reading every tracked ref via `git rev-parse`.
  for (const dir of [`${commonDir}/refs/heads`, commonDir]) {
    try {
      const sub = await parcel.subscribe(dir, (err: Error | null) => {
        if (err) {
          console.error(`[git-watcher] watcher error on ${dir}`, err);
          return;
        }
        scheduleRecompute();
      });
      subscriptions.push(sub);
    } catch (err) {
      console.error(`[git-watcher] failed to open watcher on ${dir}`, err);
    }
  }

  reconcileTimer = setInterval(() => {
    void recompute();
  }, RECONCILE_INTERVAL_MS);
}

export async function stopGitWatcher(): Promise<void> {
  if (!started) return;
  started = false;
  if (debounceTimer) clearTimeout(debounceTimer);
  if (ceilingTimer) clearTimeout(ceilingTimer);
  if (reconcileTimer) clearInterval(reconcileTimer);
  debounceTimer = null;
  ceilingTimer = null;
  reconcileTimer = null;
  const subs = subscriptions;
  subscriptions = [];
  await Promise.all(
    subs.map((s) =>
      s.unsubscribe().catch((err) => {
        console.error("[git-watcher] unsubscribe failed", err);
      }),
    ),
  );
}

function scheduleRecompute(): void {
  if (debounceTimer) return;
  const since = Date.now() - lastRecomputeAt;
  const delay =
    since >= CEILING_MS ? DEBOUNCE_MS : Math.min(DEBOUNCE_MS, CEILING_MS - since);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void recompute();
  }, delay);

  // Safety ceiling: guarantee a recompute at least every CEILING_MS.
  if (!ceilingTimer) {
    ceilingTimer = setTimeout(() => {
      ceilingTimer = null;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
        void recompute();
      }
    }, CEILING_MS);
  }
}

async function recompute(): Promise<void> {
  lastRecomputeAt = Date.now();
  if (ceilingTimer) {
    clearTimeout(ceilingTimer);
    ceilingTimer = null;
  }
  for (const refName of lastKnownSha.keys()) {
    let sha: string | null;
    try {
      sha = await readSha(refName);
    } catch (err) {
      console.error(`[git-watcher] readSha(${refName}) failed`, err);
      continue;
    }
    const previousSha = lastKnownSha.get(refName) ?? null;
    if (sha === previousSha) continue;
    lastKnownSha.set(refName, sha);
    refHeadResource.notify({ refName });
    if (sha) {
      try {
        await refAdvanced.emit({ refName, sha, previousSha });
      } catch (err) {
        console.error(`[git-watcher] emit refAdvanced(${refName}) failed`, err);
      }
    }
  }
}
