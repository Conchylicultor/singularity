import type { PaneDescriptor } from "@plugins/shell/web";
import { ScreenshotView } from "./components/screenshot-view";

export function screenshotPane({ id }: { id: string }): PaneDescriptor {
  const Component = () => <ScreenshotView id={id} />;
  return {
    title: "Screenshot",
    component: Component,
    path: `/screenshot/${id}`,
  };
}
