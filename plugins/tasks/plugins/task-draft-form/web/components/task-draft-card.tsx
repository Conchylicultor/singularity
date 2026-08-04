import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { type CSSProperties, useRef } from "react";
import { MdClose, MdDragIndicator } from "react-icons/md";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TextEditor } from "@plugins/primitives/plugins/text-editor/web";
import { HeadToolbar } from "./head-toolbar";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import type { LaunchOptionValues } from "@plugins/tasks/plugins/launch-options/web";
import { LaunchOptionChips } from "./launch-option-chips";
import { RelateModeChip } from "./relate-mode-chip";
import {
  InsertBeforeChildren,
  type ChildEntry,
} from "./insert-before-children";
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
    | React.MutableRefObject<((snippet: string) => void) | null>
    | undefined;

  // Capture-context toggles. Each is rendered iff the corresponding
  // capability is enabled by the host (omitted handlers = capability off).
  includeUrl?: boolean;
  onToggleUrl?: (v: boolean) => void;
  includeScreenshot?: boolean;
  onToggleScreenshot?: (v: boolean) => void;

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

function ContextRow({
  includeUrl,
  onToggleUrl,
  includeScreenshot,
  onToggleScreenshot,
  disabled,
}: {
  includeUrl?: boolean;
  onToggleUrl?: (v: boolean) => void;
  includeScreenshot?: boolean;
  onToggleScreenshot?: (v: boolean) => void;
  disabled: boolean;
}) {
  const showUrl = !!onToggleUrl;
  const showScreenshot = !!onToggleScreenshot;
  if (!showUrl && !showScreenshot) return null;
  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- wrapping checkbox row with asymmetric wrap gaps (gap-x-md horizontal, gap-y-xs vertical); no single-gap layout primitive expresses two-axis wrap spacing
    <div className="flex flex-wrap items-center gap-x-md gap-y-xs pt-xs">
      {showUrl && (
        <Text as="label" variant="caption" tone="muted" className="cursor-pointer">
          <Stack direction="row" align="center" gap="xs">
            <input
              type="checkbox"
              className="h-3 w-3 cursor-pointer"
              checked={!!includeUrl}
              disabled={disabled}
              onChange={(e) => onToggleUrl!(e.target.checked)}
            />
            URL
          </Stack>
        </Text>
      )}
      {showScreenshot && (
        <Text as="label" variant="caption" tone="muted" className="cursor-pointer">
          <Stack direction="row" align="center" gap="xs">
            <input
              type="checkbox"
              className="h-3 w-3 cursor-pointer"
              checked={!!includeScreenshot}
              disabled={disabled}
              onChange={(e) => onToggleScreenshot!(e.target.checked)}
            />
            Screenshot
          </Stack>
        </Text>
      )}
    </div>
  );
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
  includeScreenshot,
  onToggleScreenshot,
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
        "border-border bg-background group relative rounded-md border p-sm cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50 shadow-lg",
      )}
    >
      {/* Drag handle hint pinned to the card's top-right; off-ramp 0.375rem inset (not on the spacing ramp). */}
      <Pin to="top-right" decorative style={{ top: "0.375rem", right: "0.375rem" }}>
        <MdDragIndicator className="pointer-events-none size-3 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
      </Pin>
      <div onPointerDown={(e) => e.stopPropagation()} className="cursor-auto">
        <TextEditor
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
        />
      </div>
      {isHead && <HeadToolbar insertText={insertText} />}
      <Stack direction="row" wrap align="center" justify="between" gap="sm" className="pt-xs">
        <Stack direction="row" wrap align="center" gap="md">
          <LaunchOptionChips
            values={launchOptions}
            onChange={onLaunchOptionsChange}
            disabled={disabled}
          />
          {showRelate && (
            <RelateModeChip
              value={relateMode}
              onChange={onRelateModeChange!}
              showIndependent={showIndependentRelate}
              disabled={disabled}
            />
          )}
        </Stack>
        {removable && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label="Remove task"
            title="Remove task"
            className="text-muted-foreground hover:text-foreground hover:bg-muted size-5 rounded-md cursor-pointer"
          >
            <Center className="size-full">
              <MdClose className="size-3.5" />
            </Center>
          </button>
        )}
      </Stack>
      <ContextRow
        includeUrl={includeUrl}
        onToggleUrl={onToggleUrl}
        includeScreenshot={includeScreenshot}
        onToggleScreenshot={onToggleScreenshot}
        disabled={disabled}
      />
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
          <Text as="label" variant="caption" tone="muted" className="cursor-pointer">
            <Stack direction="row" align="center" gap="xs">
              <input
                type="checkbox"
                className="h-3 w-3 cursor-pointer"
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
