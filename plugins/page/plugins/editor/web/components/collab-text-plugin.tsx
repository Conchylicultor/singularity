import { useEffect } from "react";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { LexicalCollaboration } from "@lexical/react/LexicalCollaborationContext";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  COLLABORATION_TAG,
  COMMAND_PRIORITY_CRITICAL,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import {
  useEventCallback,
  useLatestRef,
} from "@plugins/primitives/plugins/latest-ref/web";
import { useReportSync } from "@plugins/primitives/plugins/sync-status/web";
import { runsLength, runsOf, type Block, type BlockTextVariant } from "../../core";
import { useBlockEditor } from "../block-editor-context";
import {
  $xmlBasisContentLength,
  serializeBlockRuns,
} from "../internal/block-text-extensions";
import {
  collabHydrationReportSink,
  type CollabHydrationReason,
} from "../internal/hydration-report";
import type { CapturedBlockDocEdit } from "../internal/collab-session";
import {
  useCollabBlockDoc,
  useLocalCollabBlockDoc,
  type CollabBlockDoc,
} from "../internal/use-collab-block-doc";
import { HydrationPlaceholder } from "./hydration-placeholder";

/**
 * How long a burst of content-doc updates settles before the blind-binding
 * check reads the editor. The same window the seam's projection uses, for the
 * same reason (one check per typing run, not one per keystroke) — and it must
 * not be zero: `syncYjsChangesToLexical` commits on a microtask, so a same-turn
 * check would read an editor exactly one microtask stale and call every
 * keystroke a blind binding.
 */
const BLIND_BINDING_SETTLE_MS = 1000;

/**
 * How long a block's doc may stay empty while its ROW says otherwise before
 * that counts as starvation rather than "the subscription has not arrived yet".
 * A block's editor mounts before its `page-block-doc` subscription settles, so
 * "empty right now" is the normal opening state and proves nothing; the window
 * is what turns it into evidence. One shot, re-armed only when the row changes
 * — not a poll.
 */
const STARVATION_SETTLE_MS = 5000;

/**
 * Recover a block whose rendered text no longer agrees with its content doc or
 * with the server, and report it. Two independent triggers, because either side
 * can be the one that fell behind and each is observable from a different place:
 *
 * - **blind binding** — driven by a content-doc update (the doc is the thing
 *   that moved), settled and then compared against what THIS editor renders;
 * - **starved doc** — driven by the ROW, the other independent witness of the
 *   block's content: a `data.text` push carrying text while this client's doc
 *   is empty and nothing here ever typed into it means the `page-block-doc`
 *   push that should have hydrated the doc never arrived. Row-driven precisely
 *   because a starved doc receives no doc updates at all, so the doc-side
 *   trigger can never fire for it.
 *
 * `hasLocalEdits` is what keeps the second trigger honest: a doc the user just
 * emptied legitimately trails its own ~1s row projection.
 *
 * The guard is now purely a DETECTOR: it no longer stands in front of the
 * projection write, because the projection reads the doc rather than this
 * editor and so can no longer persist a blind binding's emptiness (R1 of
 * `research/2026-08-03-page-block-content-session-one-owner.md`). What is left
 * is a real, recoverable RENDER defect — reported and healed in place, retired
 * in the stage that makes hydration a proven request/response.
 */
function useHydrationGuard(block: Block, doc: CollabBlockDoc): void {
  const [editor] = useLexicalComposerContext();
  const blockRef = useLatestRef(block);
  const { docContentLength, hasLocalEdits, rehydrate, subscribeDocUpdates } = doc;

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

  // Blind binding: the doc holds content this editor renders NOTHING of.
  // `@lexical/yjs` ingests a doc solely through the `observeDeep` events fired
  // AFTER its binding attaches, so a binding that missed them renders empty
  // FOREVER (see `binding-replica.ts`) while the doc and the server keep every
  // character. Comparing against ZERO is what makes this basis-independent —
  // the two counts disagree on any non-empty block (see `$xmlBasisContentLength`).
  const checkBlindBinding = useEventCallback(() => {
    if (docContentLength() === 0) return;
    if (runsLength(serializeBlockRuns(editor)) > 0) return;
    recover("blind-binding", 0);
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeDocUpdates(() => {
      // ONE trailing window per burst, not reset per update — the same shape
      // (and reason) as the seam's projection debounce.
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        checkBlindBinding();
      }, BLIND_BINDING_SETTLE_MS);
    });
    return () => {
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
    };
  }, [subscribeDocUpdates, checkBlindBinding]);

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
 * PROVE that this binding renders what its replica holds — the read half of the
 * session's hydration state (stage 4; the machine itself lives in
 * `collab-session.ts`, read its module comment first).
 *
 * The check runs on the first `COLLABORATION_TAG` commit after the
 * authoritative apply, and it MUST: `syncYjsChangesToLexical` commits WITHOUT
 * `discrete` while yjs emits `doc.on('update')` at the tail of the same
 * `applyUpdate`, so inside any of our own handlers the editor is exactly one
 * microtask stale — a same-turn comparison would call every keystroke a blind
 * binding. Verified against the installed packages, not assumed.
 *
 * The tag filter is not decoration. Two other commits arrive on this editor and
 * neither says anything about hydration: Lexical's own initial commit for a
 * freshly-created editor state (untagged), and `$ensureEditorNotEmpty`'s
 * follow-up, which `@lexical/yjs` fires from `onUpdate` OUTSIDE its tagged
 * block.
 *
 * The mount-time probe is `promoteOnly`: this listener registers in an effect,
 * and `CollaborationPlugin` is a CHILD, so its `connect()` has already run —
 * ordinarily still inside the same synchronous effect flush (so the commit is
 * yet to come), but a probe that could conclude DISAGREEMENT there would read a
 * merely-pending commit as a stalled binding. It may therefore only confirm.
 */
function useHydrationVerification(doc: CollabBlockDoc): void {
  const [editor] = useLexicalComposerContext();
  const { verifyRendered } = doc;
  useEffect(() => {
    verifyRendered(editor.getEditorState().read($xmlBasisContentLength), true);
    return editor.registerUpdateListener(({ tags, editorState }) => {
      if (!tags.has(COLLABORATION_TAG)) return;
      verifyRendered(editorState.read($xmlBasisContentLength));
    });
  }, [editor, verifyRendered]);
}

/**
 * The undo-capture callback handed to whichever content-doc hook runs.
 * Storage-agnostic: 1:1 `Y.UndoManager`-item mirroring applies on both the
 * server and in-memory paths.
 *
 * Stage 3b: each new coalesced local editing run in this block's content doc
 * (one Y.UndoManager stack item — the seam does the grouping and filters out
 * remote applies, replays, and split/merge-folded edits) is mirrored 1:1 onto
 * the app's single document-level undo stack, interleaved with structural
 * entries in true chronological order.
 *
 * The `doc → data.text` projection used to be its sibling here. It is now owned
 * by the seam (`use-collab-block-doc.ts`), which holds the canonical doc it
 * reads — this component no longer participates in it at all.
 */
function useUndoableEditRecorder(
  block: Block,
): (edit: CapturedBlockDocEdit) => void {
  const { recordTextEdit } = useBlockEditor();
  return useEventCallback((edit: CapturedBlockDocEdit) =>
    recordTextEdit(block.id, edit),
  );
}

/** Server-synced content-doc binding: the CRDT transport (subscription + FK gate). */
function ServerCollabTextPlugin({ block, textVariant }: CollabTextPluginProps) {
  const onUndoableEdit = useUndoableEditRecorder(block);
  const { projectText, serverIds } = useBlockEditor();
  // Doc-init FK gate (Stage 4a): a freshly created / split block renders from
  // the optimistic overlay before its `_blocks` row exists server-side —
  // seeding then would FK-violate. Gate on AUTHORITATIVE presence; the same
  // blocks push that commits the row flips this true and unlatches the seed.
  const rowConfirmed = serverIds.has(block.id);
  const doc = useCollabBlockDoc(
    block.id,
    (block.data as Record<string, unknown> | null)?.text,
    rowConfirmed,
    projectText,
    onUndoableEdit,
  );
  useHydrationGuard(block, doc);
  useHydrationVerification(doc);
  return <CollabBinding block={block} doc={doc} textVariant={textVariant} />;
}

/** In-memory content-doc binding (`persist={false}`): a purely local `Y.Doc`, no network. */
function LocalCollabTextPlugin({ block, textVariant }: CollabTextPluginProps) {
  const onUndoableEdit = useUndoableEditRecorder(block);
  const { projectText } = useBlockEditor();
  const doc = useLocalCollabBlockDoc(
    block.id,
    (block.data as Record<string, unknown> | null)?.text,
    projectText,
    onUndoableEdit,
  );
  // The blind-binding arm applies here too (a local doc can outrun its binding
  // the same way); the starved-doc arm self-disables — a local provider reports
  // `hasLocalEdits` unconditionally, since there is no server to be behind.
  useHydrationGuard(block, doc);
  // Shares the machine rather than forking it. A local session is locally
  // authoritative for its whole life, so it is already `hydrated` by the time
  // any commit arrives and this listener is a no-op — which is exactly what
  // makes `stalled` structurally unreachable on this transport.
  useHydrationVerification(doc);
  return <CollabBinding block={block} doc={doc} textVariant={textVariant} />;
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
function CollabBinding({
  block,
  doc,
  textVariant,
}: CollabTextPluginProps & { doc: CollabBlockDoc }) {
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
    <>
      <LexicalCollaboration>
        <CollaborationPlugin
          key={doc.attachGeneration}
          id={block.id}
          providerFactory={providerFactory}
          shouldBootstrap={false}
        />
      </LexicalCollaboration>
      {/* The only thing this plugin renders. `LexicalComposer` emits no DOM, so
          it lands in `TextBlockLayout`'s `relative` leaf cell — the same
          positioned ancestor Lexical's own placeholder resolves against. */}
      <HydrationPlaceholder block={block} doc={doc} textVariant={textVariant} />
    </>
  );
}

/** What a text block hands its content-doc binding. */
interface CollabTextPluginProps {
  block: Block;
  /** The block type's typography, so the hydration skeleton matches its line. */
  textVariant: BlockTextVariant;
}

/**
 * CRDT text binding for one block (per-block CRDT plan, Stage 2). Picks the
 * content-doc transport by the editor's persistence mode (stable per mount, so
 * the branch is not a hooks-order hazard): the server path binds through
 * `LiveStateYjsProvider` (subscription + doc-init/doc-update); the in-memory
 * (`persist={false}`) path binds a purely local `Y.Doc` that never networks.
 */
export function CollabTextPlugin({ block, textVariant }: CollabTextPluginProps) {
  const { serverSync } = useBlockEditor();
  return serverSync ? (
    <ServerCollabTextPlugin block={block} textVariant={textVariant} />
  ) : (
    <LocalCollabTextPlugin block={block} textVariant={textVariant} />
  );
}
