import { it, expect } from "vitest";
import { render } from "@testing-library/react";

import { defineCommand } from "@plugins/framework/plugins/web-sdk/core";

// Reproduces the crash "No handler for command \"improve.openWithText\"":
// the same command provider (ActionBar.Item → ImproveButton) is rendered in two
// places at once (main toolbar + floating bar). When navigation unmounts one of
// them, an unconditional `handler = null` cleanup used to wipe a handler the
// other live provider still owned, leaving a mounted dispatcher with no handler.
function Provider({ cmd, value }: { cmd: ReturnType<typeof defineCommand<void, string>>; value: string }) {
  cmd.useHandler(() => value);
  return null;
}

it("a co-mounted provider keeps handling after the other unmounts", () => {
  const cmd = defineCommand<void, string>("test.cmd");

  // Two providers mounted simultaneously — the most recent wins.
  const a = render(<Provider cmd={cmd} value="A" />);
  const b = render(<Provider cmd={cmd} value="B" />);
  expect(cmd()).toBe("B");

  // The top provider unmounts → the previous one transparently resumes.
  b.unmount();
  expect(cmd()).toBe("A");

  // The remaining provider unmounts → no handler left.
  a.unmount();
  expect(() => cmd()).toThrow(/No handler for command/);
});

it("unmounting a stale co-provider does not wipe the live handler", () => {
  const cmd = defineCommand<void, string>("test.cmd2");

  // A registers first (e.g. floating bar), then B mounts over it (toolbar).
  const a = render(<Provider cmd={cmd} value="A" />);
  const b = render(<Provider cmd={cmd} value="B" />);

  // A unmounts last (floating bar hides after navigation). The dispatcher must
  // still reach B — this is the exact ordering that produced the crash.
  a.unmount();
  expect(cmd()).toBe("B");

  b.unmount();
});
