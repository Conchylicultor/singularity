import type { ComponentType } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { formatRelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import {
  RELATION_LABEL,
  type ArtifactItem,
} from "@plugins/conversations/plugins/conversation-view/plugins/artifacts/core";
import { useCloseArtifacts } from "../internal/close-context";
import { RelationMarker } from "./relation-marker";

export interface ArtifactRowProps {
  /** The artifact, as the host merged it. Owns the relation and the timestamps. */
  item: ArtifactItem;
  /** What to call it — the kind resolves this (a prototype's name, a basename). */
  title: string;
  /** The kind's glyph. Every row of one kind shows the same one. */
  icon: ComponentType<{ className?: string }>;
  /** Opens the artifact. Omit for an artifact that has nowhere to go. */
  onOpen?: () => void;
  /**
   * Why this row cannot be opened, e.g. a packaged skill with no file on disk.
   * Replaces the default tooltip's second line and greys the row out.
   */
  inertReason?: string;
}

/**
 * One artifact, on one line: the kind's glyph, what it is called, and a mark
 * for what the conversation did to it.
 *
 * Shared by every kind that lists rows, so a prototype line and a research line
 * cannot drift apart. A kind whose items want a different shape — thumbnails,
 * name chips — renders its own and reuses {@link RelationMarker} instead.
 *
 * A row the conversation only *looked at* is muted, which is the whole of the
 * "referenced" signal: no mark, quieter text.
 *
 * Activating a row also dismisses the popover it is in, so a kind cannot ship a
 * row that navigates and leaves the panel hanging over what it opened.
 */
export function ArtifactRow({
  item,
  title,
  icon: Icon,
  onOpen,
  inertReason,
}: ArtifactRowProps) {
  const close = useCloseArtifacts();
  const referenced = item.relation === "referenced";
  const detail =
    inertReason ??
    `${RELATION_LABEL[item.relation]} · ${formatRelativeTime(new Date(item.lastAt))}`;

  return (
    <Line
      as="button"
      type="button"
      disabled={inertReason !== undefined || onOpen === undefined}
      onClick={() => {
        onOpen?.();
        close();
      }}
      title={`${item.key}\n${detail}`}
      className={cn(
        "w-full gap-sm rounded-md px-xs py-2xs text-left",
        "hover:bg-muted/60 disabled:cursor-default disabled:opacity-60",
      )}
    >
      <Icon className={cn("size-4 text-muted-foreground", rigidClass())} />
      <Fill>
        <Text className={cn(referenced && "text-muted-foreground")}>
          {title}
        </Text>
      </Fill>
      <RelationMarker relation={item.relation} />
    </Line>
  );
}
