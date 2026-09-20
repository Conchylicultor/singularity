import type { StackSample } from "@plugins/infra/plugins/stack-sampler/core";

// Which plugin's code was on the thread when a sample was taken.
//
// A sample's frames run innermost → outermost and are the PHYSICAL stack only: an
// async function resumed after an `await` has lost its caller. So this names the
// OWNER of the running code — the first repo frame it can find — and does not
// pretend to know what started it. A sample with no repo frame at all is charged
// to the npm package that was running (`npm:pg`), and failing that to `native`.

const PLUGIN_SEGMENT = "/plugins/";

/** `…/plugins/a/plugins/b/server/x.ts` → `a/b`; null for a path outside plugins. */
export function pluginOwnerOf(sourceURL: string): string | null {
  const nm = sourceURL.lastIndexOf("/node_modules/");
  const first = sourceURL.indexOf(PLUGIN_SEGMENT);
  if (first === -1 || (nm !== -1 && nm > first)) return null;
  const parts = sourceURL.slice(first + PLUGIN_SEGMENT.length).split("/");
  const names: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const name = parts[i];
    if (name === undefined || name === "") break;
    names.push(name);
    if (parts[i + 1] !== "plugins") break;
  }
  return names.length > 0 ? names.join("/") : null;
}

/** `…/node_modules/.bun/pg@8.20.0+x/node_modules/pg/lib/client.js` → `npm:pg`. */
export function npmOwnerOf(sourceURL: string): string | null {
  const marker = "/node_modules/";
  const at = sourceURL.lastIndexOf(marker);
  if (at === -1) return null;
  const rest = sourceURL.slice(at + marker.length).split("/");
  const first = rest[0];
  if (first === undefined || first === "") return null;
  const name = first.startsWith("@") && rest[1] ? `${first}/${rest[1]}` : first;
  return `npm:${name}`;
}

export function ownerOfSample(sample: StackSample): string {
  let npm: string | null = null;
  for (const frame of sample.frames) {
    if (frame.sourceURL === null) continue;
    const plugin = pluginOwnerOf(frame.sourceURL);
    if (plugin !== null) return plugin;
    npm ??= npmOwnerOf(frame.sourceURL);
  }
  if (npm !== null) return npm;
  // Frameless work the caller named (a barrel import, …) beats "native".
  if (sample.activity !== null) return `activity:${sample.activity.name}`;
  return "native";
}

/** Median gap between consecutive samples, in ms — the sampler's period. */
export function samplePeriodMs(samples: readonly StackSample[]): number | null {
  if (samples.length < 8) return null;
  const gaps: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (a === undefined || b === undefined) continue;
    const gap = (b.timestamp - a.timestamp) * 1000;
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return null;
  gaps.sort((x, y) => x - y);
  return gaps[Math.floor(gaps.length / 2)] ?? null;
}
