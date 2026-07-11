/**
 * The canonical General MIDI melodic instrument table — this plugin's private
 * source of all GM knowledge (the engine and track-mixer only ever see it via
 * the generic `SonataAudio.Instrument` collection API, never by importing it).
 *
 * Each entry pairs a GM program (0-127) with its display `name`, its `gleitz`
 * soundfont file slug, and its GM `family`. The `gleitz` slug is the file name
 * the soundfont CDN serves (`<kit>/<gleitz>-<format>.js`, see shared/mirror.ts):
 * lowercase, every non-alphanumeric run collapsed to `_` (e.g. "SynthBrass 1" →
 * `synth_brass_1`). ⚠️ These slugs MUST match the CDN's file names exactly — a
 * mismatch surfaces as a mirror 502 at first play. They were copied verbatim
 * from gleitz/midi-js-soundfonts' `names.json`, so they are authoritative; if
 * the CDN renames a file, build-time verification (a play-through of each
 * instrument) is the loud signal.
 *
 * The 16 GM families are derived purely positionally: family of program `p` is
 * `GM_FAMILIES[Math.floor(p / 8)]`. The piano (program 0) is owned by the
 * dedicated sampled-piano plugin; this table still lists it for completeness,
 * but the barrel filters to programs 1-127 so there is no program overlap.
 */

import type { ComponentType } from "react";
import {
  MdPiano,
  MdAlbum,
  MdQueueMusic,
  MdMusicNote,
  MdGraphicEq,
  MdMusicVideo,
  MdLibraryMusic,
  MdCampaign,
  MdAir,
  MdWaves,
  MdFlare,
  MdBlurOn,
  MdAutoAwesome,
  MdNightlight,
  MdSurroundSound,
  MdSpeaker,
} from "react-icons/md";

/** Icon component convention used across the platform (react-icons/md style). */
type IconType = ComponentType<{ className?: string }>;

/** One General MIDI melodic patch. */
export interface GmInstrument {
  /** GM program number, 0-127. */
  program: number;
  /** Human-readable GM instrument name (picker label). */
  name: string;
  /** Soundfont file slug served by the CDN (`<gleitz>-<format>.js`). */
  gleitz: string;
  /** GM family (one of the 16), derived from `Math.floor(program / 8)`. */
  family: string;
}

/**
 * The 16 GM families, in program order. Family of program `p` is
 * `GM_FAMILIES[Math.floor(p / 8)]`.
 */
export const GM_FAMILIES = [
  "Piano",
  "Chromatic Percussion",
  "Organ",
  "Guitar",
  "Bass",
  "Strings",
  "Ensemble",
  "Brass",
  "Reed",
  "Pipe",
  "Synth Lead",
  "Synth Pad",
  "Synth Effects",
  "Ethnic",
  "Percussive",
  "Sound Effects",
] as const;

/** One react-icons/md icon per GM family (the picker's grouping glyph). */
export const familyIcon: Record<string, IconType> = {
  Piano: MdPiano,
  "Chromatic Percussion": MdAlbum,
  Organ: MdQueueMusic,
  Guitar: MdMusicNote,
  Bass: MdGraphicEq,
  Strings: MdMusicVideo,
  Ensemble: MdLibraryMusic,
  Brass: MdCampaign,
  Reed: MdAir,
  Pipe: MdWaves,
  "Synth Lead": MdFlare,
  "Synth Pad": MdBlurOn,
  "Synth Effects": MdAutoAwesome,
  Ethnic: MdNightlight,
  Percussive: MdSurroundSound,
  "Sound Effects": MdSpeaker,
};

/**
 * GM display name + gleitz slug per program, in program order (index = program).
 * Slugs are verbatim from gleitz/midi-js-soundfonts `names.json`; the names are
 * the standard GM patch names. `family` is filled in positionally by the table
 * builder below, so it can never drift from `GM_FAMILIES`.
 */
const GM_PATCHES: ReadonlyArray<{ name: string; gleitz: string }> = [
  // 0 — Piano
  { name: "Acoustic Grand Piano", gleitz: "acoustic_grand_piano" },
  { name: "Bright Acoustic Piano", gleitz: "bright_acoustic_piano" },
  { name: "Electric Grand Piano", gleitz: "electric_grand_piano" },
  { name: "Honky-tonk Piano", gleitz: "honkytonk_piano" },
  { name: "Electric Piano 1", gleitz: "electric_piano_1" },
  { name: "Electric Piano 2", gleitz: "electric_piano_2" },
  { name: "Harpsichord", gleitz: "harpsichord" },
  { name: "Clavinet", gleitz: "clavinet" },
  // 8 — Chromatic Percussion
  { name: "Celesta", gleitz: "celesta" },
  { name: "Glockenspiel", gleitz: "glockenspiel" },
  { name: "Music Box", gleitz: "music_box" },
  { name: "Vibraphone", gleitz: "vibraphone" },
  { name: "Marimba", gleitz: "marimba" },
  { name: "Xylophone", gleitz: "xylophone" },
  { name: "Tubular Bells", gleitz: "tubular_bells" },
  { name: "Dulcimer", gleitz: "dulcimer" },
  // 16 — Organ
  { name: "Drawbar Organ", gleitz: "drawbar_organ" },
  { name: "Percussive Organ", gleitz: "percussive_organ" },
  { name: "Rock Organ", gleitz: "rock_organ" },
  { name: "Church Organ", gleitz: "church_organ" },
  { name: "Reed Organ", gleitz: "reed_organ" },
  { name: "Accordion", gleitz: "accordion" },
  { name: "Harmonica", gleitz: "harmonica" },
  { name: "Tango Accordion", gleitz: "tango_accordion" },
  // 24 — Guitar
  { name: "Acoustic Guitar (nylon)", gleitz: "acoustic_guitar_nylon" },
  { name: "Acoustic Guitar (steel)", gleitz: "acoustic_guitar_steel" },
  { name: "Electric Guitar (jazz)", gleitz: "electric_guitar_jazz" },
  { name: "Electric Guitar (clean)", gleitz: "electric_guitar_clean" },
  { name: "Electric Guitar (muted)", gleitz: "electric_guitar_muted" },
  { name: "Overdriven Guitar", gleitz: "overdriven_guitar" },
  { name: "Distortion Guitar", gleitz: "distortion_guitar" },
  { name: "Guitar Harmonics", gleitz: "guitar_harmonics" },
  // 32 — Bass
  { name: "Acoustic Bass", gleitz: "acoustic_bass" },
  { name: "Electric Bass (finger)", gleitz: "electric_bass_finger" },
  { name: "Electric Bass (pick)", gleitz: "electric_bass_pick" },
  { name: "Fretless Bass", gleitz: "fretless_bass" },
  { name: "Slap Bass 1", gleitz: "slap_bass_1" },
  { name: "Slap Bass 2", gleitz: "slap_bass_2" },
  { name: "Synth Bass 1", gleitz: "synth_bass_1" },
  { name: "Synth Bass 2", gleitz: "synth_bass_2" },
  // 40 — Strings
  { name: "Violin", gleitz: "violin" },
  { name: "Viola", gleitz: "viola" },
  { name: "Cello", gleitz: "cello" },
  { name: "Contrabass", gleitz: "contrabass" },
  { name: "Tremolo Strings", gleitz: "tremolo_strings" },
  { name: "Pizzicato Strings", gleitz: "pizzicato_strings" },
  { name: "Orchestral Harp", gleitz: "orchestral_harp" },
  { name: "Timpani", gleitz: "timpani" },
  // 48 — Ensemble
  { name: "String Ensemble 1", gleitz: "string_ensemble_1" },
  { name: "String Ensemble 2", gleitz: "string_ensemble_2" },
  { name: "Synth Strings 1", gleitz: "synth_strings_1" },
  { name: "Synth Strings 2", gleitz: "synth_strings_2" },
  { name: "Choir Aahs", gleitz: "choir_aahs" },
  { name: "Voice Oohs", gleitz: "voice_oohs" },
  { name: "Synth Choir", gleitz: "synth_choir" },
  { name: "Orchestra Hit", gleitz: "orchestra_hit" },
  // 56 — Brass
  { name: "Trumpet", gleitz: "trumpet" },
  { name: "Trombone", gleitz: "trombone" },
  { name: "Tuba", gleitz: "tuba" },
  { name: "Muted Trumpet", gleitz: "muted_trumpet" },
  { name: "French Horn", gleitz: "french_horn" },
  { name: "Brass Section", gleitz: "brass_section" },
  { name: "Synth Brass 1", gleitz: "synth_brass_1" },
  { name: "Synth Brass 2", gleitz: "synth_brass_2" },
  // 64 — Reed
  { name: "Soprano Sax", gleitz: "soprano_sax" },
  { name: "Alto Sax", gleitz: "alto_sax" },
  { name: "Tenor Sax", gleitz: "tenor_sax" },
  { name: "Baritone Sax", gleitz: "baritone_sax" },
  { name: "Oboe", gleitz: "oboe" },
  { name: "English Horn", gleitz: "english_horn" },
  { name: "Bassoon", gleitz: "bassoon" },
  { name: "Clarinet", gleitz: "clarinet" },
  // 72 — Pipe
  { name: "Piccolo", gleitz: "piccolo" },
  { name: "Flute", gleitz: "flute" },
  { name: "Recorder", gleitz: "recorder" },
  { name: "Pan Flute", gleitz: "pan_flute" },
  { name: "Blown Bottle", gleitz: "blown_bottle" },
  { name: "Shakuhachi", gleitz: "shakuhachi" },
  { name: "Whistle", gleitz: "whistle" },
  { name: "Ocarina", gleitz: "ocarina" },
  // 80 — Synth Lead
  { name: "Lead 1 (square)", gleitz: "lead_1_square" },
  { name: "Lead 2 (sawtooth)", gleitz: "lead_2_sawtooth" },
  { name: "Lead 3 (calliope)", gleitz: "lead_3_calliope" },
  { name: "Lead 4 (chiff)", gleitz: "lead_4_chiff" },
  { name: "Lead 5 (charang)", gleitz: "lead_5_charang" },
  { name: "Lead 6 (voice)", gleitz: "lead_6_voice" },
  { name: "Lead 7 (fifths)", gleitz: "lead_7_fifths" },
  { name: "Lead 8 (bass + lead)", gleitz: "lead_8_bass__lead" },
  // 88 — Synth Pad
  { name: "Pad 1 (new age)", gleitz: "pad_1_new_age" },
  { name: "Pad 2 (warm)", gleitz: "pad_2_warm" },
  { name: "Pad 3 (polysynth)", gleitz: "pad_3_polysynth" },
  { name: "Pad 4 (choir)", gleitz: "pad_4_choir" },
  { name: "Pad 5 (bowed)", gleitz: "pad_5_bowed" },
  { name: "Pad 6 (metallic)", gleitz: "pad_6_metallic" },
  { name: "Pad 7 (halo)", gleitz: "pad_7_halo" },
  { name: "Pad 8 (sweep)", gleitz: "pad_8_sweep" },
  // 96 — Synth Effects
  { name: "FX 1 (rain)", gleitz: "fx_1_rain" },
  { name: "FX 2 (soundtrack)", gleitz: "fx_2_soundtrack" },
  { name: "FX 3 (crystal)", gleitz: "fx_3_crystal" },
  { name: "FX 4 (atmosphere)", gleitz: "fx_4_atmosphere" },
  { name: "FX 5 (brightness)", gleitz: "fx_5_brightness" },
  { name: "FX 6 (goblins)", gleitz: "fx_6_goblins" },
  { name: "FX 7 (echoes)", gleitz: "fx_7_echoes" },
  { name: "FX 8 (sci-fi)", gleitz: "fx_8_scifi" },
  // 104 — Ethnic
  { name: "Sitar", gleitz: "sitar" },
  { name: "Banjo", gleitz: "banjo" },
  { name: "Shamisen", gleitz: "shamisen" },
  { name: "Koto", gleitz: "koto" },
  { name: "Kalimba", gleitz: "kalimba" },
  { name: "Bagpipe", gleitz: "bagpipe" },
  { name: "Fiddle", gleitz: "fiddle" },
  { name: "Shanai", gleitz: "shanai" },
  // 112 — Percussive
  { name: "Tinkle Bell", gleitz: "tinkle_bell" },
  { name: "Agogo", gleitz: "agogo" },
  { name: "Steel Drums", gleitz: "steel_drums" },
  { name: "Woodblock", gleitz: "woodblock" },
  { name: "Taiko Drum", gleitz: "taiko_drum" },
  { name: "Melodic Tom", gleitz: "melodic_tom" },
  { name: "Synth Drum", gleitz: "synth_drum" },
  { name: "Reverse Cymbal", gleitz: "reverse_cymbal" },
  // 120 — Sound Effects
  { name: "Guitar Fret Noise", gleitz: "guitar_fret_noise" },
  { name: "Breath Noise", gleitz: "breath_noise" },
  { name: "Seashore", gleitz: "seashore" },
  { name: "Bird Tweet", gleitz: "bird_tweet" },
  { name: "Telephone Ring", gleitz: "telephone_ring" },
  { name: "Helicopter", gleitz: "helicopter" },
  { name: "Applause", gleitz: "applause" },
  { name: "Gunshot", gleitz: "gunshot" },
];

/**
 * The full 128-entry GM table (programs 0-127). The barrel filters to 1-127 —
 * program 0 (acoustic grand) is owned by the dedicated sampled-piano plugin.
 */
export const GM_INSTRUMENTS: ReadonlyArray<GmInstrument> = GM_PATCHES.map(
  (patch, program) => {
    // program is 0-127, so the family index is 0-15 — always in range. The `??`
    // only satisfies noUncheckedIndexedAccess; it can never actually fire.
    const family = GM_FAMILIES[Math.floor(program / 8)] ?? "Piano";
    return { program, name: patch.name, gleitz: patch.gleitz, family };
  },
);
