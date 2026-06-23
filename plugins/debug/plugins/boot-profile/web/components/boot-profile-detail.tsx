import { type ReactElement } from "react";
import {
  useEndpoint,
  getEndpointErrorMessage,
  EndpointError,
} from "@plugins/infra/plugins/endpoints/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { getSavedBootTrace } from "../../shared/endpoints";
import { BootProfileGantt } from "./boot-profile-gantt";

// Detail render of a saved snapshot. Loads the full blob by id, then paints it
// through the SAME pure Gantt as the live capture, with a read-only banner in
// place of the live controls.
export function BootProfileDetail({ id }: { id: string }): ReactElement {
  const { data, error, isLoading } = useEndpoint(getSavedBootTrace, { id });

  if (isLoading) {
    return (
      <Center axis="both" className="h-full">
        <Loading />
      </Center>
    );
  }

  if (error) {
    // A 404 (unknown id) is the common case — render a graceful not-found state
    // rather than the generic error surface.
    const notFound = error instanceof EndpointError && error.status === 404;
    return (
      <Center axis="both" className="h-full p-2xl text-center">
        <Placeholder tone={notFound ? "muted" : "error"}>
          {notFound
            ? `No saved boot trace with id "${id}".`
            : getEndpointErrorMessage(error)}
        </Placeholder>
      </Center>
    );
  }

  if (!data) {
    return (
      <Center axis="both" className="h-full">
        <Loading />
      </Center>
    );
  }

  const banner = (
    // eslint-disable-next-line layout/no-adhoc-layout -- banner strip mirrors the live header strip
    <div className="flex items-center gap-sm border-b px-lg py-sm">
      <Text as="span" variant="caption" className="text-muted-foreground">
        Saved snapshot ·{" "}
      </Text>
      <Text as="span" variant="caption" className="text-muted-foreground">
        <RelativeTime date={data.createdAt} />
      </Text>
      <Text as="span" variant="caption" className="font-mono text-muted-foreground">
        · {data.worktree}
      </Text>
    </div>
  );

  return <BootProfileGantt trace={data.snapshot} header={banner} />;
}
