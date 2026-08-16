/** One line of an outline — a section the reader can be in and jump to. */
export interface OutlineEntry {
  /** Opaque to the primitive; handed straight back to `resolve`. */
  id: string;
  /** Single-line text shown in the expanded panel. */
  label: string;
  /** 0 = top level. Drives dash width and panel indent; clamped past the ramp. */
  depth: number;
}
