import { CollapsibleWrap } from "@plugins/primitives/plugins/collapsible-wrap/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Conversation } from "../slots";

export function HeaderView() {
  return (
    <Stack
      as="span"
      direction="row"
      gap="xs"
      align="center"
      // eslint-disable-next-line layout/no-adhoc-layout -- flexible leaf of PaneChrome's not-yet-drained title flex row
      className="min-w-0 flex-1"
    >
      <CollapsibleWrap rows={1} gap={6}>
        <Conversation.Header.Render>
          {(item) => <item.component />}
        </Conversation.Header.Render>
      </CollapsibleWrap>
    </Stack>
  );
}
