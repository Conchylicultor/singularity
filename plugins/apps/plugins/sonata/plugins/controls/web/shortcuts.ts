/** One tempo step per up/down press. (←/→ seek is owned by `SeekHoldController`,
 *  which needs keyup + auto-repeat to distinguish a tap from a press-and-hold —
 *  something the keydown-only shortcut registry can't express.)
 *
 *  The Space / ↑ / ↓ transport shortcuts are registered per-surface (focus-
 *  scoped) by `TransportShortcuts`, so they fire only on the focused Sonata
 *  window and drive ITS own transport — see `components/transport-shortcuts.tsx`. */
export const TEMPO_STEP = 0.1;
