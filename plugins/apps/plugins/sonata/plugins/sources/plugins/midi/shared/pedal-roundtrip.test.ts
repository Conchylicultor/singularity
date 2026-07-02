import { describe, expect, test } from "bun:test";
import { Midi } from "@tonejs/midi";
import { resolvePedalSustain } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { buildBachPreludeTracks } from "../server/internal/bach-prelude";
import { parseMidi } from "./parse";

describe("bach starter pedal round-trip", () => {
  test("addCC → toArray → parseMidi yields pedal events that extend notes", () => {
    const bpm = 69;
    const tracks = buildBachPreludeTracks(bpm);
    const midi = new Midi();
    midi.header.setTempo(bpm);
    for (const td of tracks) {
      const t = midi.addTrack();
      if (td.name) t.name = td.name;
      if (td.program != null) t.instrument.number = td.program;
      for (const n of td.notes)
        t.addNote({
          midi: n.midi,
          time: n.time,
          duration: n.duration,
          ...(n.velocity != null ? { velocity: n.velocity / 127 } : {}),
        });
      for (const s of td.pedal ?? []) {
        t.addCC({ number: 64, value: 1, time: s.down });
        t.addCC({ number: 64, value: 0, time: s.up });
      }
    }
    const score = parseMidi(midi.toArray());
    expect(score.pedalEvents.length).toBeGreaterThan(0);
    // Down/up events should balance (each span is a down + an up).
    const downs = score.pedalEvents.filter((p) => p.down).length;
    const ups = score.pedalEvents.filter((p) => !p.down).length;
    expect(downs).toBe(ups);
    // The pedal should actually extend some notes' sounding time.
    const sustain = resolvePedalSustain(score.notes, score.pedalEvents);
    expect(sustain.size).toBeGreaterThan(0);
  });
});
