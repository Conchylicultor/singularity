import { useEffect, useRef } from "react";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { LexicalCollaboration } from "@lexical/react/LexicalCollaborationContext";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  COMMAND_PRIORITY_CRITICAL,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import {
  useEventCallback,
  useLatestRef,
} from "@plugins/primitives/plugins/latest-ref/web";
import { coalesce, runsOf, type Block } from "../../core";
import { useBlockEditor } from "../block-editor-context";
import { serializeBlockRuns } from "../internal/block-text-extensions";
import {
  useCollabBlockDoc,
  type CapturedBlockDocEdit,
} from "../internal/use-collab-block-doc";

/**
 * Debounce for the `content doc → data.text` projection write. Heavy on
 * purpose: rows only need to trail the doc closely enough for search /
 * backlinks / history — sub-second staleness is fine, and
 * a long window keeps `blocksChanged` fan-out bounded during a typing run.
 */
const PROJECT_DEBOUNCE_MS = 1000;

/**
 * Keep `page_blocks.data.text` current from the authoritative content doc
 * (per-block CRDT plan, Stage 3a). Trigger: every `Y.Doc` update (local AND
 * server-applied — push-based, never a poll), debounced to one trailing write.
 * Value: the bound editor's serialized runs — the collab binding mirrors the
 * doc into Lexical synchronously, so serializing the editor is byte-identical
 * to `xmlTextToRuns` on the doc (same walk, same extension set) without a
 * headless replica per flush.
 *
 * The write goes through `projectText`: NOT recorded on the undo stack (Yjs
 * owns text history) and never echoed into this editor (it is
 * bound to the doc; `data.text` is only read once, as the doc-init seed).
 * Skip-if-unchanged keeps no-op churn out of `blocksChanged`. Multiple
 * connected clients each project the same runs — idempotent/convergent,
 * accepted for the my-devices+agents concurrency target.
 *
 * Returns the (stable) doc-update callback to hand to `useCollabBlockDoc`.
 */
function useTextProjection(block: Block): () => void {
  const { projectText } = useBlockEditor();
  const [editor] = useLexicalComposerContext();
  const blockRef = useLatestRef(block);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useEventCallback(() => {
    timerRef.current = null;
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const runs = serializeBlockRuns(editor);
    const current = coalesce(
      runsOf((blockRef.current.data as Record<string, unknown> | null)?.text),
    );
    // Runs are canonical (coalesced, sorted marks), so JSON equality is exact.
    if (JSON.stringify(runs) === JSON.stringify(current)) return;
    projectText(blockRef.current.id, runs);
  });

  useEffect(() => {
    return () => {
      // Unmount (navigation, block removal): flush the pending
      // projection now so rows never lag the doc past the debounce window.
      // Only fires when a doc update marked us dirty — a never-synced editor
      // (still empty, subscription pending) must NOT project its emptiness.
      // `projectText` no-ops when the row is already gone (merge / delete).
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      flush();
    };
  }, [flush]);

  // Event-driven debounce: each doc update marks dirty and arms ONE trailing
  // timer (not reset per keystroke), so a continuous typing run projects at
  // most once per PROJECT_DEBOUNCE_MS instead of starving until a pause.
  return useEventCallback(() => {
    dirtyRef.current = true;
    if (timerRef.current === null) {
      timerRef.current = setTimeout(flush, PROJECT_DEBOUNCE_MS);
    }
  });
}

/**
 * CRDT text binding for one block (per-block CRDT plan, Stage 2): mounts
 * `@lexical/react`'s `CollaborationPlugin` against the block's shared
 * `Y.Doc` + `LiveStateYjsProvider` from `useCollabBlockDoc` — the transport
 * seam. `shouldBootstrap={false}`: the doc is seeded through the server's
 * first-writer-wins doc-init, never bootstrapped by Lexical (bootstrapping
 * locally would race a concurrent seeder into duplicated content).
 *
 * Each block gets its own `LexicalCollaboration` context so per-block doc
 * maps never share a global registry (and `useCollaborationContext` — which
 * throws without a provider — is satisfied). Cursors are effectively off:
 * awareness is real but never broadcast, so no remote states ever render.
 */
export function CollabTextPlugin({ block }: { block: Block }) {
  const onContentChange = useTextProjection(block);
  const { recordTextEdit, serverIds } = useBlockEditor();
  // Doc-init FK gate (Stage 4a): a freshly created / split block renders from
  // the optimistic overlay before its `_blocks` row exists server-side —
  // seeding then would FK-violate. Gate on AUTHORITATIVE presence; the same
  // blocks push that commits the row flips this true and unlatches the seed.
  const rowConfirmed = serverIds.has(block.id);
  // Stage 3b: each new coalesced local editing run in this block's content doc
  // (one Y.UndoManager stack item — the seam does the grouping and filters out
  // remote applies, replays, and split/merge-folded edits) is mirrored 1:1
  // onto the app's single document-level undo stack, interleaved with
  // structural entries in true chronological order.
  const onUndoableEdit = useEventCallback((edit: CapturedBlockDocEdit) =>
    recordTextEdit(block.id, edit),
  );
  const providerFactory = useCollabBlockDoc(
    block.id,
    (block.data as Record<string, unknown> | null)?.text,
    rowConfirmed,
    onContentChange,
    onUndoableEdit,
  );
  const [editor] = useLexicalComposerContext();

  // CollaborationPlugin force-installs its OWN per-block Y.UndoManager on
  // Lexical's UNDO/REDO commands. This app deliberately has NO per-block
  // history — undo is the single document-level stack routed through
  // window-level shortcuts (see editor/CLAUDE.md), which since Stage 3b also
  // drives text via the seam's Y.UndoManager (recorded above). Swallow the
  // commands at CRITICAL priority so CollaborationPlugin's manager never
  // fires; the native keydown still bubbles to the document stack.
  useEffect(() => {
    const unregisterUndo = editor.registerCommand(
      UNDO_COMMAND,
      () => true,
      COMMAND_PRIORITY_CRITICAL,
    );
    const unregisterRedo = editor.registerCommand(
      REDO_COMMAND,
      () => true,
      COMMAND_PRIORITY_CRITICAL,
    );
    return () => {
      unregisterUndo();
      unregisterRedo();
    };
  }, [editor]);

  return (
    <LexicalCollaboration>
      <CollaborationPlugin
        id={block.id}
        providerFactory={providerFactory}
        shouldBootstrap={false}
      />
    </LexicalCollaboration>
  );
}
