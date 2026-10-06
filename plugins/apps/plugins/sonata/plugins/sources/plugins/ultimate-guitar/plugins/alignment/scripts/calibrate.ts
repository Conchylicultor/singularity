// ─── Align UG tabs against cached beat features ──────────────────────────────
//
//   ./singularity run plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/plugins/alignment/scripts/calibrate.ts \
//     <features.json>... <ug-tab.json>... [--chords]
//
// <features.json>: a cached BeatFeatures file
//   (~/.singularity/cache/beat-features/v<N>/<settingsKey>/<videoId>.json).
// <ug-tab.json>: a UgTab, e.g. the body `POST /api/sonata/sources/ultimate-guitar/fetch`
//   returns. Each file is recognised by its shape, in any order.
//
// One features file and one tab: prints the transposition, the score and what
// it is made of (the sheet-constrained, free and all-filler log-scores per beat,
// the fit they give and the sheet coverage), the filler fraction, the decode
// time and the section-occurrence timeline — with --chords, every chord segment
// too. Several of either: one summary line
// per (tab, features) pair, the matrix used to tune the aligner's constants and
// WEAK_MATCH_THRESHOLD (a right recording must score well above a wrong one).
// Results of the last run: research/2026-10-01-apps-sonata-ug-alignment-aligner.md.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import {
  BeatFeaturesSchema,
  type BeatFeatures,
} from "@plugins/infra/plugins/audio-analysis/core";
import {
  parseUgTab,
  UgTabSchema,
  type UgTab,
} from "@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/plugins/tab/core";
import { sheetHash, WEAK_MATCH_THRESHOLD } from "../core";
import { alignWithDiagnostics } from "../core/internal/align";

const args = process.argv.slice(2);
const showChords = args.includes("--chords");
const featureSets: BeatFeatures[] = [];
const tabs: { name: string; tab: UgTab }[] = [];
for (const path of args.filter((a) => !a.startsWith("--"))) {
  const json: unknown = JSON.parse(readFileSync(path, "utf8"));
  const asFeatures = BeatFeaturesSchema.safeParse(json);
  if (asFeatures.success) {
    featureSets.push(asFeatures.data);
    continue;
  }
  tabs.push({ name: basename(path, ".json"), tab: UgTabSchema.parse(json) });
}
if (featureSets.length === 0 || tabs.length === 0) {
  throw new Error(
    "usage: calibrate.ts <features.json>... <ug-tab.json>... [--chords]",
  );
}

function run(tab: UgTab, features: BeatFeatures) {
  const parsed = parseUgTab(tab);
  const t0 = performance.now();
  const { record, diagnostics } = alignWithDiagnostics(parsed, features, {
    capo: tab.capo,
    sheetHash: sheetHash(tab.content),
    settingsKey: "calibration",
  });
  const ms = performance.now() - t0;
  let gapBeats = 0;
  for (const seg of record.segments)
    if (seg.kind === "gap") gapBeats += seg.endBeat - seg.startBeat;
  const T = record.beats.length;
  const summary = [
    `transpose ${String(record.transpose).padStart(2)}`,
    `score ${record.score.toFixed(3)} ${record.score >= WEAK_MATCH_THRESHOLD ? "applied" : "weak   "}`,
    `constrained ${diagnostics.constrained.toFixed(3)}`,
    `free ${diagnostics.free.toFixed(3)}`,
    `base ${diagnostics.base.toFixed(3)}`,
    `fit ${diagnostics.fit.toFixed(3)}`,
    `cover ${diagnostics.coverage.toFixed(2)}`,
    `filler ${(gapBeats / T).toFixed(2)}`,
    `${String(T).padStart(3)} beats`,
    `${ms.toFixed(0).padStart(4)} ms`,
  ].join("  ");
  return { parsed, record, summary };
}

if (featureSets.length > 1 || tabs.length > 1) {
  for (const { name, tab } of tabs) {
    for (const features of featureSets) {
      console.log(
        `${name.padEnd(12)} ${features.videoId.padEnd(12)} ${run(tab, features).summary}`,
      );
    }
  }
} else {
  const { tab } = tabs[0]!;
  const features = featureSets[0]!;
  const { parsed, record, summary } = run(tab, features);
  const T = record.beats.length;
  const timeOf = (beat: number): string => {
    const t = beat < T ? record.beats[beat]!.t : record.durationSec;
    const tenths = Math.round(t * 10);
    return `${Math.floor(tenths / 600)}:${((tenths % 600) / 10).toFixed(1).padStart(4, "0")}`;
  };

  console.log(
    `${tab.artistName} — ${tab.songName} (capo ${tab.capo}) vs ${features.videoId}`,
  );
  console.log(summary);
  let current: string | null = null;
  for (const seg of record.segments) {
    const key =
      seg.kind === "gap"
        ? `gap@${seg.startBeat}`
        : `${seg.section}#${seg.occurrence}`;
    if (key !== current) {
      current = key;
      const label =
        seg.kind === "gap"
          ? "(not in sheet)"
          : `[${seg.section}] ${parsed.sections[seg.section]!.name || "(unnamed)"} #${seg.occurrence + 1}`;
      console.log(`  ${timeOf(seg.startBeat).padStart(7)}  ${label}`);
    }
    if (showChords && seg.kind === "chord") {
      const symbol =
        parsed.sections[seg.section]!.lines[seg.line]!.chords[seg.chord]!
          .symbol;
      console.log(
        `  ${timeOf(seg.startBeat).padStart(7)}      ${String(seg.endBeat - seg.startBeat).padStart(2)}  ${symbol}`,
      );
    }
  }
  console.log(`  ${timeOf(T).padStart(7)}  (end)`);
}
