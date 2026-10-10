/**
 * The small GO tab that marks an accepted suggestion — at the head of a `<go>`
 * region in the composer and in the user's sent message. `select-none`: it is a
 * mark, not text; copying the region yields the words alone.
 */
export function GoTag() {
  return (
    // The outer span's padding is the gap to the words after it (the ramp has
    // no margins).
    <span className="select-none pr-xs">
      <span className="inline-block rounded-xs bg-primary px-2xs align-middle text-3xs font-medium tracking-wider text-primary-foreground">
        GO
      </span>
    </span>
  );
}
