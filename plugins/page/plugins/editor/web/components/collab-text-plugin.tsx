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
import { coalesce, runsLength, runsOf, type Block } from "../../core";
import { useBlockEditor } from "../block-editor-context";
import { serializeBlockRuns } from "../internal/block-text-extensions";
import {
  collabHydrationReportSink,
  type CollabHydrationReason,
} from "../internal/hydration-report";
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
function useTextProjection(block: Block, hydrationRef: HydrationOpsRef): () => void {
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
    // HYDRATION GUARD. `runs` is what this binding RENDERS; the doc is what the
    // block actually holds. An editor showing nothing while its doc holds text
    // is a binding that never hydrated — `@lexical/yjs` ingests a doc solely
    // through the `observeDeep` events fired AFTER its binding attaches, so a
    // binding that missed them renders empty FOREVER (see `binding-replica.ts`)
    // while the doc and the server keep every character.
    //
    // Two things must happen, and the second is the reason this lives in front
    // of the write rather than beside it: projecting here would persist the
    // blindness into `page_blocks.data.text`, turning a recoverable render bug
    // into the row saying the block is empty. A derived value may not overwrite
    // the source it disagrees with.
    if (runsLength(runs) === 0 && hydrationRef.current.docContentLength() > 0) {
      hydrationRef.current.onBlindBinding();
      return;
    }
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
 * What the projection flush needs from the content-doc seam to run its
 * hydration guard. It arrives through a ref because the guard lives INSIDE the
 * projection callback, which the seam hook takes as an argument — so the two
 * are mutually dependent by construction and the ref is the seam between them.
 * Inert until the effect below fills it; a flush before that reads the no-op.
 */
interface HydrationOps {
  docContentLength: () => number;
  onBlindBinding: () => void;
}
type HydrationOpsRef = { current: HydrationOps };

/**
 * How long a block's doc may stay empty while its ROW says otherwise before
 * that counts as starvation rather than "the subscription has not arrived yet".
 * A block's editor mounts before its `page-block-doc` subscription settles, so
 * "empty right now" is the normal opening state and proves nothing; the window
 * is what turns it into evidence. One shot, re-armed only when the row changes
 * — not a poll.
 */
const STARVATION_SETTLE_MS = 5000;

const INERT_HYDRATION: HydrationOps = {
  docContentLength: () => 0,
  onBlindBinding: () => {},
};

/**
 * Recover a block whose rendered text no longer agrees with its content doc or
 * with the server, and report it. Two independent triggers, because either side
 * can be the one that fell behind and each is observable from a different place:
 *
 * - **blind binding** — driven by the projection flush (a doc update happened,
 *   so the doc is the thing that moved), from {@link useTextProjection};
 * - **starved doc** — driven by the ROW, the other independent witness of the
 *   block's content: a `data.text` push carrying text while this client's doc
 *   is empty and nothing here ever typed into it means the `page-block-doc`
 *   push that should have hydrated the doc never arrived. Row-driven precisely
 *   because a starved doc receives no doc updates at all, so the projection's
 *   own trigger can never fire for it.
 *
 * `hasLocalEdits` is what keeps the second trigger honest: a doc the user just
 * emptied legitimately trails its own ~1s row projection.
 */
function useHydrationGuard(
  block: Block,
  doc: CollabBlockDoc,
  hydrationRef: HydrationOpsRef,
): void {
  const blockRef = useLatestRef(block);
  const { docContentLength, hasLocalEdits, rehydrate } = doc;

  const recover = useEventCallback((reason: CollabHydrationReason, shownLength: number) => {
    const b = blockRef.current;
    collabHydrationReportSink.emit({
      reason,
      blockId: b.id,
      shownLength,
      docLength: docContentLength(),
      rowLength: runsLength(runsOf((b.data as Record<string, unknown> | null)?.text)),
    });
    rehydrate();
  });

  // Fill the ref the projection flush reads. Both members are stable
  // (`useEventCallback`), so this runs once per mount — and the flush only ever
  // runs from a timer or an unmount, i.e. never before this effect.
  useEffect(() => {
    hydrationRef.current = {
      docContentLength,
      onBlindBinding: () => recover("blind-binding", 0),
    };
    return () => {
      hydrationRef.current = INERT_HYDRATION;
    };
  }, [hydrationRef, docContentLength, recover]);

  const rowLength = runsLength(
    runsOf((block.data as Record<string, unknown> | null)?.text),
  );
  useEffect(() => {
    if (rowLength === 0) return;
    if (hasLocalEdits()) return;
    if (docContentLength() > 0) return;
    // Re-verify after the settle window rather than acting on the opening
    // state (see STARVATION_SETTLE_MS). Cleared on unmount and re-armed only
    // when the row's length changes, which is what bounds the recovery to one
    // attempt per new piece of evidence instead of a retry loop.
    const timer = setTimeout(() => {
      if (hasLocalEdits() || docContentLength() > 0) return;
      recover("starved-doc", 0);
    }, STARVATION_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [rowLength, docContentLength, hasLocalEdits, recover]);
}

/**
 * The projection + undo-capture callbacks handed to whichever content-doc hook
 * runs. Storage-agnostic: the same `doc → data.text` projection and 1:1
 * `Y.UndoManager`-item mirroring apply on both the server and in-memory paths.
 */
function useCollabCallbacks(
  block: Block,
  hydrationRef: HydrationOpsRef,
): {
  onContentChange: () => void;
  onUndoableEdit: (edit: CapturedBlockDocEdit) => void;
} {
  const onContentChange = useTextProjection(block, hydrationRef);
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
  const hydrationRef = useRef<HydrationOps>(INERT_HYDRATION);
  const { onContentChange, onUndoableEdit } = useCollabCallbacks(block, hydrationRef);
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
  useHydrationGuard(block, doc, hydrationRef);
  return <CollabBinding block={block} doc={doc} />;
}

/** In-memory content-doc binding (`persist={false}`): a purely local `Y.Doc`, no network. */
function LocalCollabTextPlugin({ block }: { block: Block }) {
  const hydrationRef = useRef<HydrationOps>(INERT_HYDRATION);
  const { onContentChange, onUndoableEdit } = useCollabCallbacks(block, hydrationRef);
  const doc = useLocalCollabBlockDoc(
    block.id,
    (block.data as Record<string, unknown> | null)?.text,
    onContentChange,
    onUndoableEdit,
  );
  // The blind-binding arm applies here too (a local doc can outrun its binding
  // the same way); the starved-doc arm self-disables — a local provider reports
  // `hasLocalEdits` unconditionally, since there is no server to be behind.
  useHydrationGuard(block, doc, hydrationRef);
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
 * without a provider — is satisfied). Cursors never render: awareness is real
 * but never broadcast, and each binding's awareness is minted over the very doc
 * that binding attached to (`BindingReplica`), so the only state that exists is
 * the one `syncCursorPositions` skips as local. That second half is load-bearing
 * — awareness over ANY other doc carries a clientID the binding reads as a
 * remote peer, and the local user grows a labelled cursor of their own.
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

  // `key` is the re-attach: `CollaborationPlugin` builds its binding exactly
  // once per mount (behind its own ref), so a binding that lost hydration can
  // only be rebuilt by remounting it. The seam drops its replica in the same
  // act, so the rebuilt binding attaches to an EMPTY doc and takes the content
  // as post-attach events — the construction invariant it depends on. The
  // generation only ever changes when `rehydrate()` runs.
  return (
    <LexicalCollaboration>
      <CollaborationPlugin
        key={doc.attachGeneration}
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
