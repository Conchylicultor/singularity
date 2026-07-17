import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdTimeline } from "react-icons/md";
import { convPushProfilingPane } from "../panes";

export function PushProfilingButton() {
  const { isOpen, toggle } = convPushProfilingPane.useToggle({});

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      title="Op profiling"
      aria-label="Op profiling"
      aria-pressed={isOpen}
      onClick={toggle}
      className="gap-xs"
    >
      <MdTimeline className="size-4" />
    </Button>
  );
}
