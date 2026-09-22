import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { type CSSProperties, useRef } from "react";
import { MdAdd, MdClose, MdDragIndicator, MdLink } from "react-icons/md";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ComposerField,
  ComposerAttachButton,
  ComposerRule,
} from "@plugins/primitives/plugins/text-editor/plugins/composer/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  Stack,
  Inset,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import {
  hoverRevealGroup,
  hoverRevealTarget,
} from "@plugins/primitives/plugins/hover-reveal/web";
import {
  LaunchOptionPills,
  type LaunchOptionValues,
} from "@plugins/tasks/plugins/launch-options/web";
import { DependencyPill } from "./dependency-pill";
import {
  InsertBeforeChildren,
  type ChildEntry,
} from "./insert-before-children";
import { TaskDraftFormSlots } from "../slots";
import type { TaskChainRelateMode } from "@plugins/tasks/core";

export interface TaskDraftCardProps {
  cardId: string;
  index: number;
  text: string;
  /** Contributed launch-option values, keyed by option id. */
  launchOptions: LaunchOptionValues;
  autoFocus: boolean;
  removable: boolean;
  disabled: boolean;
  onTextChange: (next: string) => void;
  onLaunchOptionsChange: (next: LaunchOptionValues) => void;
  onRemove: () => void;
  onSubmitChord: () => void;
  isHead?: boolean;
  /**
   * Optional host-owned home for this card's insert-at-caret handle. Supplied for
   * the head card so the host can drive the same insertion path the card's own
   * action slot uses; omitted, the card keeps the handle to itself.
   */
  insertRef?:
    React.MutableRefObject<((snippet: string) => void) | null> | undefined;

  // Whether this card attaches the current page URL to the filed task. Every
  // card has the toggle — it is not a per-host capability.
  includeUrl: boolean;
  onToggleUrl: (v: boolean) => void;

  // Head-card-only relate toggle.
  relateMode?: TaskChainRelateMode | undefined;
  onRelateModeChange?: (next: TaskChainRelateMode | undefined) => void;
  showIndependentRelate?: boolean;
  // Insert-before-children (follow-up with children).
  relateTaskChildren?: ChildEntry[];
  insertBeforeIds?: Set<string>;
  onInsertBeforeChange?: (next: Set<string>) => void;
  // Standalone prerequisite.
  standalone?: boolean;
  onStandaloneChange?: (next: boolean) => void;
  showStandalone?: boolean;
}

export function TaskDraftCard({
  cardId,
  index,
  text,
  launchOptions,
  autoFocus,
  removable,
  disabled,
  onTextChange,
  onLaunchOptionsChange,
  onRemove,
  onSubmitChord,
  isHead = false,
  insertRef: hostInsertRef,
  includeUrl,
  onToggleUrl,
  relateMode,
  onRelateModeChange,
  showIndependentRelate,
  relateTaskChildren,
  insertBeforeIds,
  onInsertBeforeChange,
  standalone,
  onStandaloneChange,
  showStandalone,
}: TaskDraftCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cardId });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Drives the head-card action slot (e.g. the element picker): the snippet
  // lands at the caret, deserialized into its chip by the editor's node
  // extensions. Falls back to the end of the document when the editor was never
  // focused (no live selection). The host may own the handle instead, so its own
  // programmatic inserts go through this exact path.
  const localInsertRef = useRef<((snippet: string) => void) | null>(null);
  const insertRef = hostInsertRef ?? localInsertRef;
  const insertText = (snippet: string) => {
    const insert = insertRef.current;
    if (!insert) throw new Error("TaskDraftCard: editor not mounted");
    insert(snippet);
  };

  const showRelate = isHead && !!onRelateModeChange;

  return (
    <Stack
      gap="none"
      ref={setNodeRef}
      style={style}
      data-card-index={index}
      {...attributes}
      {...listeners}
      className={cn(
        // No border and no padding of its own: the composer field below is the
        // card's only box. What is left here is the drag host — the thing you
        // grab, and what the hover affordances at its corner hang off.
        hoverRevealGroup,
        "relative cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50 shadow-lg",
      )}
    >
      {/* Remove and the drag hint, together at the card's top-right corner and
          revealed on hover — the field's bar has no room for chrome that is
          about the card rather than about the task. */}
      <Pin to="top-right" offset="xs">
        <Line className={cn("gap-2xs", hoverRevealTarget)}>
          {removable && (
            <IconButton
              icon={MdClose}
              label="Remove task"
              onClick={onRemove}
              disabled={disabled}
            />
          )}
          <MdDragIndicator
            aria-hidden
            className="pointer-events-none size-3 text-muted-foreground/30"
          />
        </Line>
      </Pin>
      <div onPointerDown={(e) => e.stopPropagation()} className="cursor-auto">
        <ComposerField
          value={text}
          onChange={onTextChange}
          onSubmit={onSubmitChord}
          submitMode="cmd-enter"
          placeholder={isHead ? "Describe the task…" : "Next task…"}
          disabled={disabled}
          autoFocus={autoFocus}
          minRows={isHead ? 5 : 2}
          maxHeight={isHead ? "20rem" : "8rem"}
          namespace={`task-draft-card-${cardId}`}
          insertRef={insertRef}
          attach={
            <ComposerAttachButton
              icon={MdAdd}
              activeIcon={MdLink}
              label="Attach page URL"
              active={includeUrl}
              onToggle={onToggleUrl}
              disabled={disabled}
            />
          }
          barStart={
            <CardBarStart
              insertText={insertText}
              values={launchOptions}
              onChange={onLaunchOptionsChange}
              disabled={disabled}
              relate={
                showRelate
                  ? {
                      value: relateMode,
                      onChange: onRelateModeChange!,
                      showIndependent: showIndependentRelate,
                    }
                  : null
              }
            />
          }
          barEnd={
            <LaunchOptionPills
              side="end"
              values={launchOptions}
              onChange={onLaunchOptionsChange}
              disabled={disabled}
            />
          }
        />
      </div>
      {relateTaskChildren &&
        relateTaskChildren.length > 0 &&
        insertBeforeIds &&
        onInsertBeforeChange && (
          <InsertBeforeChildren
            children={relateTaskChildren}
            selectedIds={insertBeforeIds}
            onChange={onInsertBeforeChange}
            disabled={disabled}
          />
        )}
      {showStandalone && onStandaloneChange && (
        <Inset x="sm" y="xs">
          <Text as="label" variant="caption" tone="muted">
            <Stack direction="row" align="center" gap="xs">
              <input
                type="checkbox"
                className="h-3 w-3"
                checked={!!standalone}
                disabled={disabled}
                onChange={(e) => onStandaloneChange(e.target.checked)}
              />
              Standalone (don't inherit existing dependencies)
            </Stack>
          </Text>
        </Inset>
      )}
    </Stack>
  );
}

/**
 * The leading half of the card's bar: the contributed actions that write into
 * the prose (the element picker), then — past a hairline — the pills that
 * configure what submitting it does.
 *
 * Every card carries the action slot, not just the head: each card owns its own
 * caret-insert handle, so a picked element lands in the prose you are actually
 * writing. (The HOST's funnel is the head card's alone — that is where an
 * insert fired from outside the form has to go, since it must pick one card.)
 *
 * It draws no hairline when nothing contributed to the slot: a rule with
 * nothing on one side of it is just a mark.
 */
function CardBarStart({
  insertText,
  values,
  onChange,
  disabled,
  relate,
}: {
  insertText: (text: string) => void;
  values: LaunchOptionValues;
  onChange: (next: LaunchOptionValues) => void;
  disabled: boolean;
  relate: {
    value: TaskChainRelateMode | undefined;
    onChange: (next: TaskChainRelateMode | undefined) => void;
    showIndependent?: boolean;
  } | null;
}) {
  const actions = TaskDraftFormSlots.Action.useContributions();
  const showActions = actions.length > 0;
  return (
    <>
      {showActions && (
        <>
          <TaskDraftFormSlots.Action.Render>
            {(item) => <item.component insertText={insertText} />}
          </TaskDraftFormSlots.Action.Render>
          <ComposerRule />
        </>
      )}
      <LaunchOptionPills
        side="start"
        values={values}
        onChange={onChange}
        disabled={disabled}
      />
      {relate && (
        <DependencyPill
          value={relate.value}
          onChange={relate.onChange}
          showIndependent={relate.showIndependent}
          disabled={disabled}
        />
      )}
    </>
  );
}
