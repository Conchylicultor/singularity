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
import { useReportSync } from "@plugins/primitives/plugins/sync-status/web";
import { coalesce, runsOf, type Block } from "../../core";
import { useBlockEditor } from "../block-editor-context";
import { serializeBlockRuns } from "../internal/block-text-extensions";
import {
  useCollabBlockDoc,
  useLocalCollabBlockDoc,
  type CapturedBlockDocEdit,
  type CollabBlockDoc,
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
 * The projection + undo-capture callbacks handed to whichever content-doc hook
 * runs. Storage-agnostic: the same `doc → data.text` projection and 1:1
 * `Y.UndoManager`-item mirroring apply on both the server and in-memory paths.
 */
function useCollabCallbacks(block: Block): {
  onContentChange: () => void;
  onUndoableEdit: (edit: CapturedBlockDocEdit) => void;
} {
  const onContentChange = useTextProjection(block);
  const { recordTextEdit } = useBlockEditor();
  // Stage 3b: each new coalesced local editing run in this block's content doc
  // (one Y.UndoManager stack item — the seam does the grouping and filters out
  // remote applies, replays, and split/merge-folded edits) is mirrored 1:1
  // onto the app's single document-level undo stack, interleaved with
  // structural entries in true chronological order.
  const onUndoableEdit = useEventCallback((edit: CapturedBlockDocEdit) =>
    recordTextEdit(block.id, edit),
  );
  return { onContentChange, onUndoableEdit };
}

/** Server-synced content-doc binding: the CRDT transport (subscription + FK gate). */
function ServerCollabTextPlugin({ block }: { block: Block }) {
  const { onContentChange, onUndoableEdit } = useCollabCallbacks(block);
  const { serverIds } = useBlockEditor();
  // Doc-init FK gate (Stage 4a): a freshly created / split block renders from
  // the optimistic overlay before its `_blocks` row exists server-side —
  // seeding then would FK-violate. Gate on AUTHORITATIVE presence; the same
  // blocks push that commits the row flips this true and unlatches the seed.
  const rowConfirmed = serverIds.has(block.id);
  const doc = useCollabBlockDoc(
    block.id,
    (block.data as Record<string, unknown> | null)?.text,
    rowConfirmed,
    onContentChange,
    onUndoableEdit,
  );
  return <CollabBinding block={block} doc={doc} />;
}

/** In-memory content-doc binding (`persist={false}`): a purely local `Y.Doc`, no network. */
function LocalCollabTextPlugin({ block }: { block: Block }) {
  const { onContentChange, onUndoableEdit } = useCollabCallbacks(block);
  const doc = useLocalCollabBlockDoc(
    block.id,
    (block.data as Record<string, unknown> | null)?.text,
    onContentChange,
    onUndoableEdit,
  );
  return <CollabBinding block={block} doc={doc} />;
}

/**
 * The shared `CollaborationPlugin` mount + Lexical UNDO/REDO swallow, given the
 * {@link CollabBlockDoc} from either transport. `shouldBootstrap={false}`: the
 * doc is seeded through the provider (server first-writer-wins doc-init, or the
 * local seed), never bootstrapped by Lexical (bootstrapping locally would race
 * a concurrent seeder into duplicated content).
 *
 * Each block gets its own `LexicalCollaboration` context so per-block doc maps
 * never share a global registry (and `useCollaborationContext` — which throws
 * without a provider — is satisfied). Cursors are effectively off: awareness is
 * real but never broadcast, so no remote states ever render.
 *
 * Mounted exactly once per block, this is also where the block's prose reports
 * into the surface's sync-status cloud: the `doc-update` pipeline is what makes
 * text durable, so "Saved" must mean the provider's queue drained — not that
 * the (~1 s, derived) `data.text` projection happened to settle. The in-memory
 * transport reports a permanently idle state (nothing to save), which the
 * cloud aggregates to silence.
 */
function CollabBinding({ block, doc }: { block: Block; doc: CollabBlockDoc }) {
  const { providerFactory, saveState, retrySave } = doc;
  const [editor] = useLexicalComposerContext();

  // One reporter per block; the surface's store aggregates them
  // (error > syncing > saved > idle), so a single dirty block keeps the cloud
  // spinning and a single durably-rejected one turns it red. Offline reports
  // `syncing`, not `error` — the bytes are queued and retry push-based.
  useReportSync({
    phase: saveState.phase,
    label: "text",
    retry: saveState.phase === "error" ? retrySave : undefined,
    savedAt: saveState.lastFlushedAt,
  });

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

/**
 * CRDT text binding for one block (per-block CRDT plan, Stage 2). Picks the
 * content-doc transport by the editor's persistence mode (stable per mount, so
 * the branch is not a hooks-order hazard): the server path binds through
 * `LiveStateYjsProvider` (subscription + doc-init/doc-update); the in-memory
 * (`persist={false}`) path binds a purely local `Y.Doc` that never networks.
 */
export function CollabTextPlugin({ block }: { block: Block }) {
  const { serverSync } = useBlockEditor();
  return serverSync ? (
    <ServerCollabTextPlugin block={block} />
  ) : (
    <LocalCollabTextPlugin block={block} />
  );
}
