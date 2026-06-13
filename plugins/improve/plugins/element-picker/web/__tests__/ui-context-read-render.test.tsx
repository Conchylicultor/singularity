import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  PluginProvider,
  type LoadedPlugin,
} from "@plugins/framework/plugins/web-sdk/core";
import { ActiveData, useActiveDataLinkify } from "@plugins/active-data/web";
import { FileLinkText, linkifyChildren } from "@plugins/primitives/plugins/file-links/web";
import { UI_CONTEXT_RE } from "../../core";
import { UiContextTag } from "../components/ui-context-tag";

// The reported bug: a `<ui-context …>` token rendered as a chip while composing
// but printed as raw text once sent. The fix registers it as an active-data
// inline contribution, so every read surface (user-text, assistant markdown)
// renders it through useActiveDataLinkify. This pins that the raw tag is
// replaced by the chip — including a realistic tag whose `url=`/`selector=`
// attributes carry slashes and `>` chars.
const plugin = {
  id: "ui-context-read-test",
  description: "ui-context read-render fixture",
  contributions: [
    ActiveData.Tag({ display: "inline", pattern: UI_CONTEXT_RE, component: UiContextTag }),
  ],
} as unknown as LoadedPlugin;

function ReadView({ text }: { text: string }) {
  const linkify = useActiveDataLinkify();
  return <div data-testid="read">{linkify(text)}</div>;
}

// Surfaces that also linkify file paths (e.g. the JSONL user-text row) compose
// the active-data linkify with file-links. The active-data walk skips custom
// components, so file-links must be applied via its functional `linkifyChildren`
// over the *result* of active-data linkify — active-data first (text → chips +
// Fragment-wrapped text), file-links second (recurses Fragments, wraps the
// remaining strings, leaves chips opaque).
function ComposedView({ text }: { text: string }) {
  const linkify = useActiveDataLinkify();
  return <div data-testid="composed">{linkifyChildren(linkify(text))}</div>;
}

// The pre-fix composition: wrapping the raw string in <FileLinkText> first and
// walking *that* with active-data linkify. <FileLinkText> is a custom component,
// which the walk leaves opaque — so the `<ui-context>` text inside is never
// seen, and the tag prints raw. Pinned so the broken order can't silently return.
function BrokenOrderView({ text }: { text: string }) {
  const linkify = useActiveDataLinkify();
  return <div data-testid="broken">{linkify(<FileLinkText text={text} />)}</div>;
}

afterEach(cleanup);

describe("ui-context renders as a chip on read surfaces", () => {
  const tag =
    '<ui-context url="http://x.localhost:9000/agents/c/conv-1781335518-caii" plugin="apps.sonata.track-mixer" selector="div>div>div"><hint>h</hint><picked-content>div — Track mixer</picked-content></ui-context>';

  it("replaces the raw tag with the chip (label visible, tag text gone)", () => {
    const { getByTestId } = render(
      <PluginProvider plugins={[plugin]}>
        <ReadView text={`Look at ${tag} please`} />
      </PluginProvider>,
    );
    const el = getByTestId("read");
    expect(el.textContent).toContain("div — Track mixer");
    expect(el.textContent).not.toContain("<ui-context");
    // The chip's trigger is a button.
    expect(el.querySelector("button")).not.toBeNull();
  });

  it("composes with file-links (user-text row): chip renders, file path still links", () => {
    const { getByTestId } = render(
      <PluginProvider plugins={[plugin]}>
        <ComposedView text={`See ${tag} and research/foo.md`} />
      </PluginProvider>,
    );
    const el = getByTestId("composed");
    expect(el.textContent).toContain("div — Track mixer");
    expect(el.textContent).not.toContain("<ui-context");
    // The ui-context chip and the file-link chip both render as buttons; the
    // file path survives the composition rather than being swallowed.
    expect(el.querySelector("button")).not.toBeNull();
    expect(el.textContent).toContain("research/foo.md");
  });

  it("regression: wrapping in <FileLinkText> first leaves the tag raw", () => {
    const { getByTestId } = render(
      <PluginProvider plugins={[plugin]}>
        <BrokenOrderView text={`See ${tag}`} />
      </PluginProvider>,
    );
    // The walk bails at the opaque <FileLinkText> root, so the tag is never
    // replaced — this is exactly the bug the composed order above fixes.
    expect(getByTestId("broken").textContent).toContain("<ui-context");
  });
});
