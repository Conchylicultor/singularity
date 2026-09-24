import { z } from "zod";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";

/**
 * The size presets a prototype is designed at and viewed at: the device's
 * SCREEN. One list for the whole Prototypes app — the tag an author writes, the
 * canvas's size menu, the gallery thumbnail and Compare all read it, so a size
 * one of them knows is a size all of them know.
 */
export const SIZE_PRESETS = [
  { name: "Phone", w: 480, h: 900 },
  { name: "Tablet", w: 768, h: 1024 },
  { name: "Laptop", w: 1024, h: 640 },
  { name: "Desktop", w: 1280, h: 800 },
  { name: "Wide", w: 1600, h: 900 },
] as const;

export type PresetName = (typeof SIZE_PRESETS)[number]["name"];

/**
 * The size a prototype declares with `<meta name="prototype-viewport">`: a
 * preset, or `responsive` — the page fills whatever room it is given (a
 * component mock, a layout meant to stretch).
 *
 * Named, never pixels: a free `WxH` was an arbitrary number per prototype
 * (1320x868, 1360x860, 1440x900 …) that matched no preset, so the canvas could
 * only show it as "Custom". What an author means is the KIND of screen.
 */
export type PrototypeViewport =
  { kind: "responsive" } | { kind: "preset"; preset: PresetName };

/** What a prototype that declares no size is: a desktop app screen. */
export const DEFAULT_PROTOTYPE_VIEWPORT = {
  kind: "preset",
  preset: "Desktop",
} as const satisfies PrototypeViewport;

const isPresetName = (v: unknown): v is PresetName =>
  SIZE_PRESETS.some((p) => p.name === v);

/** The wire shape of a declared size. Mirrors `PrototypeViewport` exactly. */
export const PrototypeViewportSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("responsive") }),
  z.object({
    kind: z.literal("preset"),
    preset: z.custom<PresetName>(isPresetName, "not a size preset"),
  }),
]) satisfies ZodParser<PrototypeViewport>;

/** The words the tag accepts: `responsive`, then each preset lowercased. */
export const PROTOTYPE_VIEWPORT_WORDS: readonly string[] = [
  "responsive",
  ...SIZE_PRESETS.map((p) => p.name.toLowerCase()),
];

/**
 * Parse the tag's `content`. Absent or blank is the default (not a problem);
 * a word outside {@link PROTOTYPE_VIEWPORT_WORDS} — the old `1320x868` form
 * included — is `malformed`, which the folder's problems report and every
 * reader treats as the default.
 */
export function parseViewport(
  raw: string | undefined,
): { ok: true; viewport: PrototypeViewport } | { ok: false; raw: string } {
  const word = (raw ?? "").trim().toLowerCase();
  if (word === "") return { ok: true, viewport: DEFAULT_PROTOTYPE_VIEWPORT };
  if (word === "responsive")
    return { ok: true, viewport: { kind: "responsive" } };
  const preset = SIZE_PRESETS.find((p) => p.name.toLowerCase() === word);
  return preset
    ? { ok: true, viewport: { kind: "preset", preset: preset.name } }
    : { ok: false, raw: (raw ?? "").trim() };
}

/** The `problems[]` detail for a tag {@link parseViewport} refused. */
export function viewportProblemDetail(raw: string): string {
  return `<meta name="prototype-viewport" content="${raw}"> is not a size — write one of ${PROTOTYPE_VIEWPORT_WORDS.join(", ")} (the default is desktop). Pixel sizes are no longer read`;
}

/** A preset's logical size. */
export function presetSize(name: PresetName): { w: number; h: number } {
  const preset = SIZE_PRESETS.find((p) => p.name === name);
  if (!preset) throw new Error(`unknown size preset "${name}"`);
  return { w: preset.w, h: preset.h };
}

/**
 * The fixed size to render a prototype at where there is no room to fill — a
 * headless browser taking its thumbnail, Compare sizing its window. A
 * responsive page renders at the default's size.
 */
export function viewportRenderSize(v: PrototypeViewport): {
  w: number;
  h: number;
} {
  return presetSize(
    v.kind === "preset" ? v.preset : DEFAULT_PROTOTYPE_VIEWPORT.preset,
  );
}
