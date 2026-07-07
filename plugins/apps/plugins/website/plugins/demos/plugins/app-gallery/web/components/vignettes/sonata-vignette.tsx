import { useEffect, useMemo, useRef, useState } from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { Keyboard } from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/keyboard/web";
import {
  Sonata,
  type InstrumentVoices,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

/** Two octaves, C4–B5: a C low edge and a B high edge keep the keyboard flush. */
const LOW_PITCH = 60;
const HIGH_PITCH = 83;
const VELOCITY = 96;

type SoundState = "idle" | "loading" | "ready";

const CAPTION: Record<SoundState, string> = {
  idle: "Click or drag across the keys.",
  loading: "Loading the sampled grand…",
  ready: "This is Sonata's real keyboard plugin and sampled piano.",
};

/**
 * The REAL Sonata embed: the same stateless `Keyboard` primitive and the same
 * default sampled-grand `Instrument` the Sonata app plays through — no toy
 * replica. The audio graph is owned locally (a private `AudioContext` → gain →
 * the instrument's voices), created lazily on the first key press so browser
 * autoplay policy is satisfied by the user gesture.
 *
 * Sonata's plugins load in the DEFERRED tier, so `useContributions()` is empty
 * for a beat after boot — until the default instrument resolves we show a warm-up
 * placeholder instead of the keyboard. Lit keys give instant visual feedback even
 * before the samples finish loading (the first notes may be silent); the caption
 * tracks the sample-load state.
 */
export function SonataVignette() {
  const [litPitches, setLitPitches] = useState<number[]>([]);
  const [soundState, setSoundState] = useState<SoundState>("idle");

  const instruments = Sonata.Instrument.useContributions();
  // Default instrument, resolved generically via the collection API — never by
  // naming the piano plugin. Mirrored through latest-ref so the stable
  // interaction reads it live once the deferred tier loads.
  const defaultInstrument = useMemo(
    () => instruments.find((i) => i.default) ?? instruments[0],
    [instruments],
  );
  const instrumentRef = useLatestRef(defaultInstrument);

  // Locally-owned audio graph, created lazily on first press; per-pitch note-off
  // fns for the sustaining hand-played voices.
  const audioRef = useRef<{
    ctx: AudioContext;
    gain: GainNode;
    voices: InstrumentVoices;
  } | null>(null);
  const heldRef = useRef<Map<number, () => void>>(new Map());

  // A stable interaction object whose callbacks read refs, so the keyboard never
  // re-attaches. Built once (setState setters are stable; instrumentRef is a
  // stable latest-ref).
  const interaction = useMemo(() => {
    const ensureAudio = () => {
      if (audioRef.current) return audioRef.current;
      const inst = instrumentRef.current;
      if (!inst) return null;
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.value = 0.9;
      gain.connect(ctx.destination);
      const voices = inst.createVoices(ctx, gain);
      audioRef.current = { ctx, gain, voices };
      setSoundState("loading");
      // Start the sample load; surface a rejected load loudly (async throw →
      // unhandled rejection) rather than leaving it floating or silenced.
      void voices.loaded.then(
        () => setSoundState("ready"),
        (err: unknown) => {
          throw err instanceof Error ? err : new Error(String(err));
        },
      );
      return audioRef.current;
    };

    return {
      onPress(pitch: number) {
        setLitPitches((prev) => (prev.includes(pitch) ? prev : [...prev, pitch]));
        const audio = ensureAudio();
        if (!audio) return;
        void audio.ctx.resume();
        // Retrigger: release an already-held voice for this pitch first.
        const prev = heldRef.current.get(pitch);
        if (prev) {
          prev();
          heldRef.current.delete(pitch);
        }
        const stop = audio.voices.play?.(pitch, VELOCITY);
        if (stop) heldRef.current.set(pitch, stop);
      },
      onRelease(pitch: number) {
        setLitPitches((prev) => prev.filter((p) => p !== pitch));
        const stop = heldRef.current.get(pitch);
        if (stop) {
          stop();
          heldRef.current.delete(pitch);
        }
      },
    };
  }, [instrumentRef]);

  // Tear the audio graph down on unmount: release held voices, dispose the voice
  // manager, close the context. Capture the stable held-map for the cleanup
  // (reading the ref directly in cleanup trips react-hooks/refs).
  useEffect(() => {
    const held = heldRef.current;
    return () => {
      for (const stop of held.values()) stop();
      held.clear();
      const audio = audioRef.current;
      audio?.voices.dispose();
      void audio?.ctx.close();
      audioRef.current = null;
    };
  }, []);

  return (
    <Card>
      <Stack gap="md">
        <Text variant="subheading" as="h3">
          Play the grand piano
        </Text>
        <div role="group" aria-label="Sonata piano demo">
          {defaultInstrument ? (
            <Keyboard
              low={LOW_PITCH}
              high={HIGH_PITCH}
              lit={litPitches}
              interaction={interaction}
              className="h-32 w-full"
            />
          ) : (
            <Center axis="both" className="h-32 w-full">
              <Loading variant="spinner" label="Warming up the piano…" />
            </Center>
          )}
        </div>
        <Text variant="caption" tone="muted">
          {CAPTION[soundState]}
        </Text>
      </Stack>
    </Card>
  );
}
