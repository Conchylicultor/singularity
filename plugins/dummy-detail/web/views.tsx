import type { PaneDescriptor } from "@plugins/shell/web/commands";
import { DummyDetail } from "./components/dummy-detail";

export function dummyDetailPane(args: { itemId: string; label: string }): PaneDescriptor {
  const Component = () => <DummyDetail itemId={args.itemId} label={args.label} />;
  return { title: args.label, component: Component };
}
