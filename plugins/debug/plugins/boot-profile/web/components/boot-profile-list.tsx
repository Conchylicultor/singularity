import { type ReactElement } from "react";
import {
  useEndpoint,
  getEndpointErrorMessage,
} from "@plugins/infra/plugins/endpoints/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { listBootTraces } from "../../shared/endpoints";
import { bootProfileDetailPane } from "../panes";

// Browse pane: lists saved snapshots (metadata only — no blob), each row opening
// the detail pane. Fetched on open (NOT polled); saved traces only change on an
// explicit Copy permalink click or the 30-day sweep.
export function BootProfileList(): ReactElement {
  const openPane = useOpenPane();
  const { data, error, isLoading } = useEndpoint(listBootTraces, {});

  if (isLoading) {
    return (
      <Inset pad="lg">
        <Loading />
      </Inset>
    );
  }

  if (error) {
    return (
      <Inset pad="lg">
        <Placeholder tone="error">{getEndpointErrorMessage(error)}</Placeholder>
      </Inset>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <Inset pad="lg">
        <Placeholder>
          No saved boot traces yet. Use Copy permalink on the Boot Profile page to
          save one.
        </Placeholder>
      </Inset>
    );
  }

  return (
    <Inset pad="md">
      <Stack gap="2xs">
        {data.items.map((item) => (
          <Row
            key={item.id}
            onClick={() =>
              openPane(bootProfileDetailPane, { id: item.id }, { mode: "push" })
            }
          >
            <Stack gap="2xs">
              <Text as="div" variant="body">
                <RelativeTime date={new Date(item.createdAt)} />
              </Text>
              <Text as="div" variant="caption" className="font-mono text-muted-foreground">
                {item.worktree} · {item.id}
              </Text>
            </Stack>
          </Row>
        ))}
      </Stack>
    </Inset>
  );
}
