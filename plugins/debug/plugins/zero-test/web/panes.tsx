import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { ZeroRoot, useZeroResource } from "@plugins/database/plugins/zero/plugins/client/web";
import { ResourceView } from "@plugins/primitives/plugins/live-state/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { schema, zql } from "../core";

export const zeroTestPane = Pane.define({
  id: "zero-test",
  segment: "zero-test",
  component: ZeroTestBody,
});

function ZeroTestBody(): ReactElement {
  return (
    <PaneChrome pane={zeroTestPane} title="Zero Test">
      <ZeroRoot schema={schema}>
        <TaskList />
      </ZeroRoot>
    </PaneChrome>
  );
}

function TaskList(): ReactElement {
  const result = useZeroResource(
    zql.task.orderBy("updatedAt", "desc").limit(50),
  );
  return (
    <Scroll axis="y" fill>
      <Stack gap="xs">
        <ResourceView resource={result} fallback={<Loading variant="rows" />}>
          {(tasks) =>
            tasks.map((t) => (
              <Row key={t.id}>
                <Text>{t.title}</Text>
              </Row>
            ))
          }
        </ResourceView>
      </Stack>
    </Scroll>
  );
}
