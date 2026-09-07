import type { PitchLayoutId } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { jankoChrome } from "./janko";
import { pianoChrome } from "./piano";
import type { KeyChrome } from "./types";

/**
 * How each pitch layout is painted. A `Record` over the closed `PitchLayoutId`
 * rather than a slot: adding a layout id without a chrome is a `tsc` error here,
 * which is the whole reason the id set is plain data.
 */
export const KEY_CHROME: Record<PitchLayoutId, KeyChrome> = {
  piano: pianoChrome,
  janko: jankoChrome,
};

export type {
  ChromeDecor,
  ChromeDecorContext,
  KeyChrome,
  KeyChromeStyle,
  KeyPaint,
  KeyPaintContext,
  KeyTier,
  LabelTone,
  LitKey,
} from "./types";
