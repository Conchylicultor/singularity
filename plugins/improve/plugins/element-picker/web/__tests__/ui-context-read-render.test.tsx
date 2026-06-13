import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  PluginProvider,
  type LoadedPlugin,
} from "@plugins/framework/plugins/web-sdk/core";
import { ActiveData, useActiveDataLinkify } from "@plugins/active-data/web";
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
});
