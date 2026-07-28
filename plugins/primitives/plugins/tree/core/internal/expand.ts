/**
 * One row's expand/collapse intent.
 *
 * Expand writes travel as a **batch** of these, never one row at a time: a single
 * gesture (expand-all, the reveal-on-select ancestor walk) legitimately touches N
 * rows, and every layer downstream — the optimistic overlay's `setState`, the
 * view's expand map, the localStorage blob — must apply the whole batch in ONE
 * update. A per-row API turns those layers quadratic (N re-copies / N
 * serializations of a map growing to N keys).
 */
export type ExpandChange = {
  id: string;
  expanded: boolean;
};
