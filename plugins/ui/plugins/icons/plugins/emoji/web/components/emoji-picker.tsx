import { createContext, useContext } from "react";
import {
  EmojiPicker as Frimousse,
  type EmojiPickerListCategoryHeaderProps,
  type EmojiPickerListEmojiProps,
  type EmojiPickerListRowProps,
} from "frimousse";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { assetMirrorUrl } from "@plugins/infra/plugins/asset-mirror/core";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";
import { EmojiSchema, type Emoji } from "../../core";
import { EmojiGlyph } from "./emoji-glyph";
import { EMOJIBASE_LOCALE, EMOJIBASE_MIRROR_ID } from "../../shared/mirror";

const searchIcon = symbol("search");

const COLUMNS = 9;

/**
 * The newest Unicode emoji version the picker offers. Every picked emoji is
 * re-validated by {@link EmojiSchema} — in the browser here and again by the
 * server's own copy of the schema — whose `\p{RGI_Emoji}` table is the engine's
 * Unicode data. Capping below the newest emojibase release keeps the picker from
 * offering an emoji one runtime draws and the other's schema cannot recognise.
 */
const EMOJI_VERSION = 15.1;

const EMOJIBASE_URL = assetMirrorUrl(EMOJIBASE_MIRROR_ID);

/** The picker's current value, read by the (module-level, identity-stable) cell renderer. */
const SelectedEmoji = createContext<Emoji | null>(null);

function CategoryHeader({
  category,
  ...props
}: EmojiPickerListCategoryHeaderProps) {
  return (
    <div
      {...props}
      // eslint-disable-next-line spacing/no-adhoc-spacing -- a category label's offset above its first emoji row
      className="bg-popover pb-1 pt-2 text-3xs text-muted-foreground/60"
    >
      {category.label}
    </div>
  );
}

function EmojiRow({ children, ...props }: EmojiPickerListRowProps) {
  // frimousse sets the row's display:flex itself; this only spaces its cells.
  return (
    <div {...props} className="gap-xs pb-xs">
      {children}
    </div>
  );
}

function EmojiCell({ emoji, ...props }: EmojiPickerListEmojiProps) {
  const selected = useContext(SelectedEmoji) === emoji.emoji;
  return (
    <button
      {...props}
      aria-pressed={selected}
      className={cn(
        "size-7 rounded-md data-[active]:bg-accent",
        selected && "bg-accent ring-1 ring-ring",
      )}
    >
      <Center>
        <EmojiGlyph emoji={emoji.emoji} className="size-5" />
      </Center>
    </button>
  );
}

// Module-level so frimousse's memoized rows keep their component identity
// across renders (an inline object would remount every visible row).
const LIST_COMPONENTS = {
  CategoryHeader,
  Row: EmojiRow,
  Emoji: EmojiCell,
};

export interface EmojiPickerProps {
  /** Currently-selected emoji, highlighted in the grid. */
  value?: Emoji | null;
  /** Fired with the picked emoji — what the caller stores. */
  onSelect: (emoji: Emoji) => void;
  className?: string;
}

/**
 * Searchable, categorized emoji grid over frimousse (headless, virtualized).
 * Its emojibase data comes from the same-origin asset mirror
 * (`/api/asset-mirror/emojibase/en/…`), never a CDN, so it works offline after
 * one warm-up. Renders just the emoji block (header + search + grid) — surface
 * chrome (popover, footer rows) is the caller's, and like `IconPicker` it
 * applies no content inset of its own, landing on its host panel's rail.
 *
 * Mount it only while visible (e.g. inside an open popover): it loads its data
 * on mount.
 */
export function EmojiPicker({ value, onSelect, className }: EmojiPickerProps) {
  return (
    <Stack gap="xs" className={className}>
      <SectionLabel as="span">Emoji</SectionLabel>
      <Frimousse.Root
        locale={EMOJIBASE_LOCALE}
        columns={COLUMNS}
        emojiVersion={EMOJI_VERSION}
        emojibaseUrl={EMOJIBASE_URL}
        // A picked emoji is parsed, not cast: an emoji the schema rejects is a
        // broken assumption about the data, and throws here rather than being
        // stored.
        onEmojiSelect={(picked) => onSelect(EmojiSchema.parse(picked.emoji))}
        // eslint-disable-next-line layout/no-adhoc-layout -- frimousse's root is the column that stacks the search field over its self-sizing viewport
        className="isolate flex flex-col gap-xs"
      >
        <div className="relative">
          <Pin to="left" offset="sm" decorative>
            <Icon
              icon={searchIcon}
              className="size-3.5 text-muted-foreground"
            />
          </Pin>
          <Frimousse.Search
            placeholder="Search emoji…"
            // eslint-disable-next-line spacing/no-adhoc-spacing -- pl-7 reserves the gutter the absolutely-positioned search icon sits in
            className="w-full appearance-none rounded-md border border-input bg-background py-xs pl-7 pr-sm text-caption outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          />
        </div>
        <Frimousse.Viewport className="relative h-64 outline-none">
          <Frimousse.Loading>
            <Loading label="Loading emoji…" className="py-2xl text-center" />
          </Frimousse.Loading>
          <Frimousse.Empty className="block py-lg text-center text-caption text-muted-foreground">
            No emoji found.
          </Frimousse.Empty>
          <SelectedEmoji.Provider value={value ?? null}>
            <Frimousse.List
              className="select-none pb-xs"
              components={LIST_COMPONENTS}
            />
          </SelectedEmoji.Provider>
        </Frimousse.Viewport>
      </Frimousse.Root>
    </Stack>
  );
}
