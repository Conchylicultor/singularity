/**
 * The empty-block wedge, pinned against a real Lexical editor.
 *
 * This is the regression test for the bug the primitive exists to kill: with a
 * `dismissedRef` latch, `Esc` → clear the block → retype the trigger left the
 * menu permanently closed, because an empty Lexical block has no TextNode (the
 * selection anchor is the ParagraphNode) and the branch that cleared the latch
 * was unreachable from there.
 *
 * It asserts on the hook's DERIVED `open`, not on the rendered surface — the
 * surface is caret-rect anchored (`caretAnchor()`), and jsdom has no layout, so
 * `FloatingSurface` would never paint here. The derivation is where the bug
 * lived and where the fix has to hold.
 */

import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isTextNode,
  FOCUS_COMMAND,
  type LexicalEditor,
} from "lexical";
import { useCaretMenu, useCaretQuery } from "../internal/use-caret-trigger";

afterEach(cleanup);

interface Sink {
  open?: boolean;
  dismiss?: () => void;
  editor?: LexicalEditor;
}

function mount() {
  const sink: Sink = {};

  // `sink` is captured from the enclosing closure rather than passed as a prop:
  // writing through a prop during render trips `react-hooks/immutability`.
  function Probe() {
    const [editor] = useLexicalComposerContext();
    const caret = useCaretQuery({ id: "slash", trigger: "/" });
    useCaretMenu(caret, { itemCount: 3, onCommit: () => {} });
    sink.open = caret.open;
    sink.dismiss = caret.dismiss;
    sink.editor = editor;
    return null;
  }

  render(
    <LexicalComposer
      initialConfig={{
        namespace: "caret-trigger-test",
        onError: (e: Error) => {
          throw e;
        },
      }}
    >
      <PlainTextPlugin
        contentEditable={<ContentEditable />}
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <Probe />
    </LexicalComposer>,
  );
  const editor = sink.editor!;
  // The hook gates `open` on focus. Drive the real command rather than faking
  // the state, so a future change to the focus wiring fails here.
  act(() => {
    editor.dispatchCommand(FOCUS_COMMAND, undefined as never);
  });
  return { sink, editor };
}

/**
 * Append `text` at the caret, reusing the existing TextNode when there is one —
 * this is what real typing does. Rebuilding the node instead would mint a fresh
 * `nodeKey` and legitimately reset the dismissal identity, hiding the behavior
 * these tests are pinning.
 */
function type(editor: LexicalEditor, text: string) {
  act(() => {
    editor.update(
      () => {
        const root = $getRoot();
        let p = root.getFirstChild();
        if (p === null) {
          p = $createParagraphNode();
          root.append(p);
        }
        const existing = $getRoot().getLastDescendant();
        if (existing && $isTextNode(existing)) {
          const next = existing.getTextContent() + text;
          existing.setTextContent(next);
          existing.select(next.length, next.length);
        } else {
          const t = $createTextNode(text);
          (p as ReturnType<typeof $createParagraphNode>).append(t);
          t.select(text.length, text.length);
        }
      },
      { discrete: true },
    );
  });
}

/** Empty the document to a single childless paragraph — NO TextNode at all. */
function clear(editor: LexicalEditor) {
  act(() => {
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const p = $createParagraphNode();
        root.append(p);
        p.select(0, 0);
      },
      { discrete: true },
    );
  });
}

describe("caret-trigger: the empty-block wedge", () => {
  it("opens on the trigger", () => {
    const { sink, editor } = mount();
    type(editor, "/");
    expect(sink.open).toBe(true);
  });

  it("stays dismissed while the query keeps changing", () => {
    const { sink, editor } = mount();
    type(editor, "/");
    act(() => sink.dismiss!());
    expect(sink.open).toBe(false);
    // Same node, same trigger offset — the dismissal identity excludes the query.
    type(editor, "hea");
    expect(sink.open).toBe(false);
  });

  it("REOPENS after Esc → empty block → retype (the bug)", () => {
    const { sink, editor } = mount();
    type(editor, "/");
    act(() => sink.dismiss!());
    expect(sink.open).toBe(false);

    // A genuinely empty paragraph: no TextNode, anchor is the element. The old
    // latch was never cleared from here.
    clear(editor);
    expect(sink.open).toBe(false);

    // With the old boolean latch this stayed false forever.
    type(editor, "/");
    expect(sink.open).toBe(true);
  });

  it("deleting just the trigger (text remains) also clears the dismissal", () => {
    const { sink, editor } = mount();
    type(editor, "a /");
    act(() => sink.dismiss!());
    expect(sink.open).toBe(false);

    // Backspace the `/` away, leaving "a " — a TextNode, but no trigger.
    act(() => {
      editor.update(
        () => {
          const t = $getRoot().getLastDescendant();
          if (t && $isTextNode(t)) {
            t.setTextContent("a ");
            t.select(2, 2);
          }
        },
        { discrete: true },
      );
    });
    expect(sink.open).toBe(false);

    type(editor, "/");
    expect(sink.open).toBe(true);
  });
});
