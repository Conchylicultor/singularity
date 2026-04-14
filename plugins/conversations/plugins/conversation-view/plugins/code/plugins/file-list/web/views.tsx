import type { MiddlePaneDescriptor } from "@plugins/conversations/plugins/conversation-view/web/commands";
import { EditedFileList } from "./components/edited-file-list";

export const EDITED_FILE_LIST_PANE_ID = "code.edited-file-list";

export function editedFileListPane(): MiddlePaneDescriptor {
  return { id: EDITED_FILE_LIST_PANE_ID, component: EditedFileList };
}
