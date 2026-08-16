import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { MdTimeline } from "react-icons/md";
import { convPushProfilingPane } from "../panes";

export function PushProfilingButton() {
  const { isOpen, toggle } = convPushProfilingPane.useToggle({});

  return (
    <IconButton
      icon={MdTimeline}
      label="Op profiling"
      variant={isOpen ? "secondary" : "ghost"}
      aria-pressed={isOpen}
      onClick={toggle}
    />
  );
}
