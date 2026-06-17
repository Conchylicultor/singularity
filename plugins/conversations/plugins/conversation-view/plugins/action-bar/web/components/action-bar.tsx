import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Conversation } from "../slots";

export function ActionBarView() {
  return (
    <Stack direction="row" gap="xs" align="center" className="w-full">
      <Conversation.ActionBar.Render>
        {(item) => <item.component />}
      </Conversation.ActionBar.Render>
    </Stack>
  );
}
