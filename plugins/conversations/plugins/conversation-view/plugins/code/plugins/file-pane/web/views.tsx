import type { MiddlePaneDescriptor } from "@plugins/conversations/plugins/conversation-view/web/commands";
import type { ConversationState } from "@plugins/conversations/plugins/conversation-view/web/slots";
import type { EditedFileStatus } from "../../../shared/protocol";
import { FilePaneView } from "./components/file-pane";

export const FILE_PANE_ID_PREFIX = "code.file-pane:";

export function filePane(args: {
  path: string;
  status: EditedFileStatus;
}): MiddlePaneDescriptor {
  const { path, status } = args;
  const Component = ({ conversation }: { conversation: ConversationState }) => (
    <FilePaneView conversation={conversation} path={path} status={status} />
  );
  return { id: `${FILE_PANE_ID_PREFIX}${path}`, component: Component };
}
