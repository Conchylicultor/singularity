import { useState } from "react";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import {
  foldResource,
  ResourceErrorInline,
} from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useConversation } from "@plugins/conversations/web";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import type { TerminalMenu } from "@plugins/conversations/plugins/terminal-menu/core";
import { answerTerminalMenu } from "../../core";
import { MenuRelay } from "../slots";
import type { MenuVariantProps } from "../variant-props";

/**
 * The `"menu"` pending prompt: the numbered menu open in the conversation's
 * terminal, answerable from here. A contributed variant draws a menu it knows;
 * any other menu gets one button per option.
 */
export function TerminalMenuCard({
  conversationId,
}: {
  conversationId: string;
  waitingFor: string;
}) {
  const conversation = useConversation(conversationId);
  return foldResource(conversation, {
    loading: () => <Loading label="Loading menu…" />,
    error: (error, _stale) => (
      <ResourceErrorInline
        variant="inline"
        subject="the terminal menu"
        error={error}
      />
    ),
    ready: (row) =>
      row?.waitingMenu ? (
        <OpenMenu conversationId={conversationId} menu={row.waitingMenu} />
      ) : null,
  });
}

function OpenMenu({
  conversationId,
  menu,
}: {
  conversationId: string;
  menu: TerminalMenu;
}) {
  const answer = useEndpointMutation(answerTerminalMenu);
  const [pending, setPending] = useState<number | "cancel" | null>(null);

  const send = (choice: number | "cancel") => {
    const option =
      choice === "cancel" ? null : menu.options.find((o) => o.n === choice);
    const params = { id: conversationId };
    const settle = { onSettled: () => setPending(null) };
    setPending(choice);
    // One call per arm: the mutation's input is a union per body arm, so a
    // body that is itself a union fits neither.
    if (option) {
      answer.mutate(
        { params, body: { kind: "option", n: option.n, label: option.label } },
        settle,
      );
    } else {
      answer.mutate({ params, body: { kind: "cancel" } }, settle);
    }
  };
  const props: MenuVariantProps = {
    conversationId,
    menu,
    choose: (n) => send(n),
    cancel: () => send("cancel"),
    pending,
  };

  return (
    <Card>
      <Stack gap="sm">
        <MenuRelay.Variant.Dispatch {...props} />
        <Stack direction="row" gap="sm" align="center">
          <Button
            variant="ghost"
            loading={pending === "cancel"}
            disabled={pending !== null}
            onClick={props.cancel}
          >
            Cancel
          </Button>
          <JsonlViewer.PendingPromptAction.Render />
        </Stack>
      </Stack>
    </Card>
  );
}
