import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/section-label/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { CONV_STATUS_DOT } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { agentLaunchesResource } from "../../shared/resources";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

function formatDate(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AgentLaunches({ agentId }: { agentId: string }) {
  const launchesQ = useResource(agentLaunchesResource);
  const openPane = useOpenPane();
  const convEntry = conversationPane.useRouteEntry();
  const activeConvId = convEntry?.params.convId;

  if (launchesQ.pending) return <Loading variant="text" />;

  const launches = launchesQ.data
    .filter((l) => l.agentId === agentId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return (
    <section className="flex flex-col gap-sm">
      <SectionLabel as="h3" className="font-medium">
        Attempts
      </SectionLabel>
      {launches.length === 0 ? (
        <Text as="p" variant="body" tone="muted">No attempts yet.</Text>
      ) : (
        <ul className="flex flex-col gap-xs">
          {launches.map((launch) => {
            const primary = launch.latestConversation;
            const isActive = primary ? activeConvId === primary.id : false;
            const title = primary?.title ?? `Launch ${formatDate(launch.createdAt)}`;
            return (
              <li key={launch.id}>
                <Row
                  selected={isActive}
                  bordered
                  hover="accent"
                  disabled={!primary}
                  className={!primary ? "opacity-60" : undefined}
                  icon={
                    primary ? (
                      <StatusDot colorClass={CONV_STATUS_DOT[primary.status]} />
                    ) : (
                      <StatusDot colorClass="bg-muted-foreground/40" />
                    )
                  }
                  actions={
                    <>
                      {primary ? (
                        <Text as="span" variant="caption" tone="muted" className="shrink-0">
                          {primary.status}
                        </Text>
                      ) : null}
                      <Text as="span" variant="caption" tone="muted" className="shrink-0 tabular-nums">
                        {formatDate(launch.createdAt)}
                      </Text>
                    </>
                  }
                  actionsAlwaysVisible
                  onClick={() => {
                    if (!primary) return;
                    if (isActive && convEntry) {
                      conversationPane.close(convEntry.instanceId);
                    } else {
                      openPane(conversationPane, {
                        convId: primary.id,
                      }, { mode: "push" });
                    }
                  }}
                >
                  <span className="flex-1 truncate">{title}</span>
                </Row>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
