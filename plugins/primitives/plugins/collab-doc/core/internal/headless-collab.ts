import {
  createEditor,
  type CreateEditorArgs,
  type LexicalEditor,
} from "lexical";
import {
  applyUpdate,
  Doc,
  encodeStateAsUpdate,
  encodeStateVector,
  XmlText,
} from "yjs";
import {
  createBinding,
  syncLexicalUpdateToYjs,
  syncYjsChangesToLexical,
  type Provider,
  type ProviderAwareness,
} from "@lexical/yjs";

/**
 * Domain-agnostic headless bridge between a Lexical editor state and the Yjs
 * representation `@lexical/yjs` maintains for `CollaborationPlugin`.
 *
 * `@lexical/yjs`'s V1 binding stores the document as one `Y.XmlText` under the
 * fixed doc-root key `"root"` (see `createBinding` — `doc.get('root', XmlText)`).
 * Element/decorator/linebreak nodes are embedded shared types inside it, and node
 * fields (`__`-prefixed instance properties) sync as attributes: on both
 * directions the node is constructed with `new Klass()` (zero args) and then
 * property-synced — so any custom node used with this bridge must tolerate
 * zero-arg construction (all current inline decorator nodes do).
 *
 * Both directions run a headless `createEditor()` — no DOM required, works under
 * Bun (decorator `createDOM`/`decorate` are never invoked headless).
 */

/** Binding id used for the internal doc map (nested-editor doc lookups). */
const BINDING_ID = "collab-doc";

/** The fixed Y.Doc root key `@lexical/yjs`'s V1 binding stores content under. */
export const Y_DOC_CONTENT_KEY = "root";

export interface HeadlessCollabOptions {
  /** Custom Lexical node classes to register (decorators, LinkNode, …). */
  nodes?: CreateEditorArgs["nodes"];
  /**
   * Fixed Yjs clientID for the produced doc (instead of yjs's random one).
   * For DETERMINISTIC doc construction: the same `populate` output with the
   * same clientID yields byte-identical update encodings, so two replicas
   * building the same seed independently merge as a no-op instead of
   * duplicating content. Only pass this for freshly-constructed docs whose
   * ops are a pure function of shared inputs (seeds) — never for docs that
   * take live concurrent edits.
   */
  clientID?: number;
}

/** The `Y.XmlText` content root of a doc produced by {@link yDocFromLexical}. */
export function yDocContent(doc: Doc): XmlText {
  return doc.get(Y_DOC_CONTENT_KEY, XmlText);
}

/** No-op awareness/provider pair — headless conversion has no peers or cursors. */
function noopProvider(): Provider {
  const awareness: ProviderAwareness = {
    getLocalState: () => null,
    getStates: () => new Map(),
    off: () => {},
    on: () => {},
    setLocalState: () => {},
    setLocalStateField: () => {},
  };
  return {
    awareness,
    connect: () => {},
    disconnect: () => {},
    off: () => {},
    on: () => {},
  };
}

/** A headless Lexical editor that fails loudly (never swallows Lexical errors). */
function headlessEditor(opts?: HeadlessCollabOptions): LexicalEditor {
  return createEditor({
    namespace: BINDING_ID,
    nodes: opts?.nodes ?? [],
    onError: (error) => {
      throw error;
    },
  });
}

/**
 * Build a fresh `Y.Doc` whose content root mirrors the Lexical state produced by
 * `populate` (which runs inside `editor.update()`, so `$`-prefixed Lexical APIs
 * are available). The single source of truth for the Lexical→Yjs mapping is
 * `@lexical/yjs` itself (`syncLexicalUpdateToYjs`) — this never hand-writes the
 * XmlText delta format.
 */
export function yDocFromLexical(
  populate: () => void,
  opts?: HeadlessCollabOptions,
): Doc {
  const editor = headlessEditor(opts);
  const doc = new Doc();
  if (opts?.clientID !== undefined) doc.clientID = opts.clientID;
  const provider = noopProvider();
  const binding = createBinding(
    editor,
    provider,
    BINDING_ID,
    doc,
    new Map([[BINDING_ID, doc]]),
  );
  const removeListener = editor.registerUpdateListener(
    ({
      prevEditorState,
      editorState,
      dirtyElements,
      dirtyLeaves,
      normalizedNodes,
      tags,
    }) => {
      syncLexicalUpdateToYjs(
        binding,
        provider,
        prevEditorState,
        editorState,
        dirtyElements,
        dirtyLeaves,
        normalizedNodes,
        tags,
      );
    },
  );
  try {
    editor.update(populate, { discrete: true });
  } finally {
    removeListener();
  }
  return doc;
}

/**
 * Hydrate a headless Lexical editor from `doc`'s content root and read a value
 * off it. The source doc is never mutated: its state replays into a fresh
 * replica whose deep-observer feeds `syncYjsChangesToLexical` — the exact
 * hydration path a live `CollaborationPlugin` client uses on first sync.
 */
/**
 * Apply a Lexical edit to an EXISTING doc state, headless, and return the
 * **incremental** Yjs update it produced (`encodeStateAsUpdate` against the
 * pre-edit state vector) — suitable for a merge endpoint. The input `state`
 * bytes are never mutated: they replay into a fresh replica wired BOTH ways
 * (Yjs→Lexical hydration observer + Lexical→Yjs update listener — the exact
 * dual wiring a live `CollaborationPlugin` runs), `edit` runs inside an
 * `editor.update()`, and only the delta is returned.
 *
 * Used for content-doc surgery on blocks with no mounted editor (e.g. a merge
 * into a virtualized-offscreen block): the caller fetches the authoritative
 * state, edits it here, and POSTs the returned delta — lossless, since the
 * delta merges into whatever the server holds by CRDT semantics.
 */
export function editYDocState(
  state: Uint8Array,
  edit: (editor: LexicalEditor) => void,
  opts?: HeadlessCollabOptions,
): Uint8Array {
  const editor = headlessEditor(opts);
  const replica = new Doc();
  const provider = noopProvider();
  const binding = createBinding(
    editor,
    provider,
    BINDING_ID,
    replica,
    new Map([[BINDING_ID, replica]]),
  );
  const root = binding.root.getSharedType();
  const onEvents: Parameters<XmlText["observeDeep"]>[0] = (
    events,
    transaction,
  ) => {
    if (transaction.origin !== binding) {
      syncYjsChangesToLexical(
        binding,
        provider,
        events as Parameters<typeof syncYjsChangesToLexical>[2],
        false,
      );
    }
  };
  root.observeDeep(onEvents);
  const removeListener = editor.registerUpdateListener(
    ({
      prevEditorState,
      editorState,
      dirtyElements,
      dirtyLeaves,
      normalizedNodes,
      tags,
    }) => {
      syncLexicalUpdateToYjs(
        binding,
        provider,
        prevEditorState,
        editorState,
        dirtyElements,
        dirtyLeaves,
        normalizedNodes,
        tags,
      );
    },
  );
  try {
    applyUpdate(replica, state);
    // Commit the hydration reconciliation before editing on top of it.
    editor.update(() => {}, { discrete: true });
    const beforeVector = encodeStateVector(replica);
    editor.update(() => edit(editor), { discrete: true });
    return encodeStateAsUpdate(replica, beforeVector);
  } finally {
    removeListener();
    root.unobserveDeep(onEvents);
  }
}

export function readYDoc<T>(
  doc: Doc,
  read: (editor: LexicalEditor) => T,
  opts?: HeadlessCollabOptions,
): T {
  const editor = headlessEditor(opts);
  const replica = new Doc();
  const provider = noopProvider();
  const binding = createBinding(
    editor,
    provider,
    BINDING_ID,
    replica,
    new Map([[BINDING_ID, replica]]),
  );
  const root = binding.root.getSharedType();
  const onEvents: Parameters<XmlText["observeDeep"]>[0] = (
    events,
    transaction,
  ) => {
    if (transaction.origin !== binding) {
      syncYjsChangesToLexical(
        binding,
        provider,
        events as Parameters<typeof syncYjsChangesToLexical>[2],
        false,
      );
    }
  };
  root.observeDeep(onEvents);
  try {
    applyUpdate(replica, encodeStateAsUpdate(doc));
    // Force any batched reconciliation to commit before the synchronous read.
    editor.update(() => {}, { discrete: true });
    return read(editor);
  } finally {
    root.unobserveDeep(onEvents);
  }
}
