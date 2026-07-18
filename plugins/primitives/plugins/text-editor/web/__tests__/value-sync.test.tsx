/**
 * ValueSyncPlugin's focus guard, pinned against a real Lexical editor.
 *
 * The regression this covers: an external `value` change applies via
 * `applyMarkdownToEditor` (root.clear() + full rebuild), which destroys the
 * caret/selection. The plugin must NOT do that to a focused editor — it parks
 * the replacement and applies it on blur, unless the user's own edits have since
 * superseded it (the draft wins).
 *
 * Like the caret-trigger wedge test, this drives the REAL plugin under a real
 * `LexicalComposer` and asserts on the editor's serialized content. Focus is
 * driven through Lexical's FOCUS/BLUR commands (what the plugin listens to), so
 * the test never depends on jsdom's contenteditable focus semantics.
 */

import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
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
  BLUR_COMMAND,
  FOCUS_COMMAND,
  type LexicalEditor,
} from "lexical";
import { ValueSyncPlugin } from "../components/text-editor-impl";
import { serializeEditorToMarkdown } from "../internal/markdown";

afterEach(cleanup);

interface Sink {
  editor?: LexicalEditor;
  setValue?: (v: string) => void;
}

function mount(initial: string): Sink {
  const sink: Sink = {};

  // `sink` is captured from the closure rather than passed as a prop: writing
  // through a prop during render trips `react-hooks/immutability`.
  function Probe() {
    const [editor] = useLexicalComposerContext();
    sink.editor = editor;
    return null;
  }

  function Harness() {
    const [value, setValue] = useState(initial);
    sink.setValue = setValue;
    return (
      <LexicalComposer
        initialConfig={{
          namespace: "value-sync-test",
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
        <ValueSyncPlugin value={value} onChange={() => {}} extensions={[]} />
      </LexicalComposer>
    );
  }

  render(<Harness />);
  return sink;
}

const content = (editor: LexicalEditor) => serializeEditorToMarkdown(editor, []);

// Let React effects + Lexical's microtask update flush settle.
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function setValue(sink: Sink, v: string) {
  await act(async () => {
    sink.setValue!(v);
    await Promise.resolve();
  });
}

async function focus(editor: LexicalEditor) {
  await act(async () => {
    editor.dispatchCommand(FOCUS_COMMAND, undefined as never);
    await Promise.resolve();
  });
}

async function blur(editor: LexicalEditor) {
  await act(async () => {
    editor.dispatchCommand(BLUR_COMMAND, undefined as never);
    await Promise.resolve();
  });
}

// Append `text` at the end, reusing the existing TextNode — what real typing
// does. A discrete update so the change listener runs synchronously.
async function type(editor: LexicalEditor, text: string) {
  await act(async () => {
    editor.update(
      () => {
        const root = $getRoot();
        let p = root.getFirstChild();
        if (p === null) {
          p = $createParagraphNode();
          root.append(p);
        }
        const last = root.getLastDescendant();
        if (last && $isTextNode(last)) {
          last.setTextContent(last.getTextContent() + text);
        } else {
          (p as ReturnType<typeof $createParagraphNode>).append($createTextNode(text));
        }
      },
      { discrete: true },
    );
    await Promise.resolve();
  });
}

describe("ValueSyncPlugin: external value never clobbers a focused editor", () => {
  it("applies the initial value on mount", async () => {
    const sink = mount("hello");
    await flush();
    expect(content(sink.editor!)).toBe("hello");
  });

  it("applies an external change immediately when NOT focused", async () => {
    const sink = mount("hello");
    await flush();
    await setValue(sink, "world");
    expect(content(sink.editor!)).toBe("world");
  });

  it("DEFERS an external change while focused, then applies it on blur", async () => {
    const sink = mount("hello");
    await flush();
    await focus(sink.editor!);

    await setValue(sink, "from-server");
    // Deferred: the focused editor keeps its content, caret intact.
    expect(content(sink.editor!)).toBe("hello");

    await blur(sink.editor!);
    // Blur applies the parked value now that there is no caret to destroy.
    expect(content(sink.editor!)).toBe("from-server");
  });

  it("DROPS a parked value once the user edits over it (the draft wins)", async () => {
    const sink = mount("hello");
    await flush();
    await focus(sink.editor!);

    // A stale server echo arrives and is parked.
    await setValue(sink, "from-server");
    expect(content(sink.editor!)).toBe("hello");

    // The user keeps typing — their edit supersedes the parked value.
    await type(sink.editor!, " world");
    expect(content(sink.editor!)).toBe("hello world");

    // Blur must NOT resurrect the stale server value over the user's edit.
    await blur(sink.editor!);
    expect(content(sink.editor!)).toBe("hello world");
  });

  it("clears a parked value when a later value catches up to the content", async () => {
    const sink = mount("hello");
    await flush();
    await focus(sink.editor!);

    await setValue(sink, "from-server");
    expect(content(sink.editor!)).toBe("hello");

    // A newer value that equals the current editor content: nothing to apply,
    // and the earlier parked value is now stale and must be dropped.
    await setValue(sink, "hello");
    await blur(sink.editor!);
    expect(content(sink.editor!)).toBe("hello");
  });
});
