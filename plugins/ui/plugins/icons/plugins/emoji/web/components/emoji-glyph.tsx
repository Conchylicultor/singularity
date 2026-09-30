import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * Draws an emoji as an ICON, not as text: the `size-*` class sets its box
 * exactly as it sets an `<Icon>`'s, and the glyph is scaled to that box
 * (`cqh` of a size container) rather than to the surrounding font size — so an
 * emoji and a Material Symbol given the same className occupy the same square.
 * It is not a type role (no `<Text>`): its size belongs to the box.
 */
export function EmojiGlyph({
  emoji,
  className = "size-4",
}: {
  emoji: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      // eslint-disable-next-line layout/no-adhoc-layout -- a rigid glyph box centring its one character, the text twin of <Icon>'s svg box
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center [container-type:size]",
        className,
      )}
    >
      {/* 85% of the box: colour emoji fonts draw a little wider than their em. */}
      <span style={{ fontSize: "85cqh", lineHeight: 1 }}>{emoji}</span>
    </span>
  );
}
