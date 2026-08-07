/**
 * Headless Lexical tests for the mark-delimiter DEPTH store.
 * Run with `bun test plugins/page/plugins/editor/web/internal/mark-depth.test.ts`.
 *
 * The store exists to make depth reachable ONLY through an explicit `markStep`,
 * because `selection.format` diverging from its node's bits is aliased by three
 * shipped mechanisms that are not delimiter steps. So the specs that matter are
 * all about what DESTROYS an entry — the store's whole safety value is that it
 * is strictly monotonic between one `markStep` and the next.
 *
 * Lexical runs without a DOM via `createEditor` + `editor.update()`. The DOM
 * `selectionchange` that would drive `SELECTION_CHANGE_COMMAND` in a browser has
 * no headless equivalent, so these dispatch the command directly — which is what
 * the browser path does too, one line later (`onSelectionChange` in Lexical's
 * `LexicalEvents`).
 */

import { test, expect, describe } from "bun:test";
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  createEditor,
  SELECTION_CHANGE_COMMAND,
  type LexicalEditor,
} from "lexical";
import type { Mark } from "../../core";
import { markStep, readMarkDepth, registerMarkDepth } from "./mark-depth";

/** A headless editor holding one paragraph: a `{code}` run "zz" and nothing else. */
function makeEditor(): {
  editor: LexicalEditor;
  nodeKey: string;
  dispose: () => void;
} {
  const editor = createEditor({
    namespace: "mark-depth-test",
    onError: (e) => {
      throw e;
    },
  });
  let nodeKey = "";
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      const para = $createParagraphNode();
      const node = $createTextNode("zz");
      node.toggleFormat("code");
      para.append(node);
      root.append(para);
      nodeKey = node.getKey();
    },
    { discrete: true },
  );
  return { editor, nodeKey, dispose: registerMarkDepth(editor) };
}

/** Collapse the caret at `(key, offset)`. */
function placeCaret(editor: LexicalEditor, key: string, offset: number): void {
  editor.update(
    () => {
      const sel = $createRangeSelection();
      sel.anchor.set(key, offset, "text");
      sel.focus.set(key, offset, "text");
      $setSelection(sel);
    },
    { discrete: true },
  );
}

/** The DOM `selectionchange` path, minus the DOM. */
function fireSelectionChange(editor: LexicalEditor): void {
  editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
}

/**
 * Let Lexical's commit land.
 *
 * An update that dirties only the SELECTION still commits — `shouldUpdate`
 * includes `editorStateHasDirtySelection` — but not synchronously: with no
 * `_flushSync` it goes through `scheduleMicroTask`. So a re-assert is visible one
 * tick later, never in the same statement that provoked it. (Irrelevant to the
 * store itself, which is written inside the update CALLBACK and is therefore
 * readable immediately — hence only these two specs need it.)
 */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const NO_MARKS: Mark[] = [];

describe("markStep records depth", () => {
  test("an escape is recorded at the caret it was taken from; a step back in clears it", () => {
    const { editor, nodeKey, dispose } = makeEditor();
    placeCaret(editor, nodeKey, 2);

    markStep(editor, NO_MARKS, true);
    expect(readMarkDepth(editor)).toEqual({
      anchorKey: nodeKey,
      anchorOffset: 2,
      marks: [],
    });

    markStep(editor, ["code"], false);
    expect(readMarkDepth(editor)).toBe(null);
    dispose();
  });

  test("an editor that never stepped has no depth", () => {
    const { editor, nodeKey, dispose } = makeEditor();
    placeCaret(editor, nodeKey, 2);
    // The Cmd+E / autoformat / merge-landing shape: a caret sitting at exactly
    // the boundary position, with no step behind it. Nothing to read.
    expect(readMarkDepth(editor)).toBe(null);
    dispose();
  });
});

describe("the entry dies the moment the caret leaves", () => {
  test("LEAVE AND RETURN to the identical anchor does not resurrect it", () => {
    // The hole this rule closes. Node keys are stable for the life of the node,
    // and the end of a line is a very common click target — so verifying the
    // entry on READ is not enough: clicking away and back reproduces the same
    // `(anchorKey, anchorOffset)` and would re-validate a step the user never
    // took, turning the next Backspace into a silent mark strip. A click cannot
    // express depth, so depth after one is 0.
    const { editor, nodeKey, dispose } = makeEditor();
    placeCaret(editor, nodeKey, 2);
    markStep(editor, NO_MARKS, true);
    expect(readMarkDepth(editor)).not.toBe(null);

    // Click somewhere else on the same line.
    placeCaret(editor, nodeKey, 0);
    fireSelectionChange(editor);
    expect(readMarkDepth(editor)).toBe(null);

    // ...and back to exactly where the step was taken.
    placeCaret(editor, nodeKey, 2);
    fireSelectionChange(editor);
    expect(readMarkDepth(editor)).toBe(null);
    dispose();
  });

  test("a selection change AT the recorded anchor keeps it (and is idempotent)", () => {
    const { editor, nodeKey, dispose } = makeEditor();
    placeCaret(editor, nodeKey, 2);
    markStep(editor, NO_MARKS, true);

    fireSelectionChange(editor);
    fireSelectionChange(editor);
    expect(readMarkDepth(editor)).toEqual({
      anchorKey: nodeKey,
      anchorOffset: 2,
      marks: [],
    });
    dispose();
  });

  test("losing the selection entirely kills it (block-selection mode drops the caret)", () => {
    const { editor, nodeKey, dispose } = makeEditor();
    placeCaret(editor, nodeKey, 2);
    markStep(editor, NO_MARKS, true);

    editor.update(() => $setSelection(null), { discrete: true });
    fireSelectionChange(editor);
    expect(readMarkDepth(editor)).toBe(null);
    dispose();
  });

  test("a content change kills it — the text is no longer what the step was taken against", () => {
    const { editor, nodeKey, dispose } = makeEditor();
    placeCaret(editor, nodeKey, 2);
    markStep(editor, NO_MARKS, true);

    editor.update(
      () => {
        const para = $getRoot().getFirstChild();
        if (!$isElementNode(para))
          throw new Error("fixture lost its paragraph");
        para.append($createTextNode("x"));
      },
      { discrete: true },
    );
    expect(readMarkDepth(editor)).toBe(null);
    dispose();
  });
});

describe("the re-assert projects the store onto selection.format", () => {
  /** Does the live collapsed caret carry `mark` as a PENDING format? */
  function caretHasFormat(editor: LexicalEditor, mark: Mark): boolean | null {
    return editor.getEditorState().read(() => {
      const selection = $getSelection();
      return $isRangeSelection(selection) ? selection.hasFormat(mark) : null;
    });
  }

  test("a format that drifted back to the node's bits is re-set from the entry", async () => {
    // What a blur/refocus or a remote patch does: Lexical's own divergence carry
    // is a ~200ms window, and once it lapses `onSelectionChange` re-derives the
    // format from the anchor NODE — leaving the user standing at a virtual stop
    // typing marked again. The store is the truth; the format is the projection.
    const { editor, nodeKey, dispose } = makeEditor();
    placeCaret(editor, nodeKey, 2);
    markStep(editor, NO_MARKS, true);
    expect(caretHasFormat(editor, "code")).toBe(false);

    // The drift: the caret's pending format snaps back to the `{code}` node's.
    editor.update(
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection))
          throw new Error("fixture lost its caret");
        selection.formatText("code");
      },
      { discrete: true },
    );
    expect(caretHasFormat(editor, "code")).toBe(true);

    fireSelectionChange(editor);
    await flush();
    expect(caretHasFormat(editor, "code")).toBe(false);
    dispose();
  });

  test("...but not once the entry is gone", async () => {
    const { editor, nodeKey, dispose } = makeEditor();
    placeCaret(editor, nodeKey, 2);
    markStep(editor, NO_MARKS, true);
    // One selection change elsewhere retires the entry; the caret's format is
    // then nobody's business but Lexical's, even back at the same anchor.
    placeCaret(editor, nodeKey, 0);
    fireSelectionChange(editor);

    placeCaret(editor, nodeKey, 2);
    editor.update(
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection))
          throw new Error("fixture lost its caret");
        selection.formatText("code");
      },
      { discrete: true },
    );
    fireSelectionChange(editor);
    await flush();
    expect(caretHasFormat(editor, "code")).toBe(true);
    dispose();
  });
});
