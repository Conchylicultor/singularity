import { MdCheckCircle, MdRadioButtonUnchecked } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  prototypeStatusesResource,
  setPrototypeStatus,
  statusOf,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import type { PrototypeGalleryRow } from "../slots";
import { usePrototypeDetail } from "../context";

// Marking a prototype Done: one shared record per prototype (`files`'
// `prototypes.statuses`, `_status/<id>.json`), toggled from the gallery card and
// from the detail pane's header. A failed write surfaces through the endpoint
// layer's global error toast; the checkbox keeps showing the stored value, since
// it reads the resource the server re-broadcasts on every write.

/** Set one prototype's Done flag. */
function useSetPrototypeDone() {
  const mutation = useEndpointMutation(setPrototypeStatus);
  return {
    pending: mutation.isPending,
    setDone: (name: string, done: boolean) =>
      mutation.mutate({ params: { name }, body: { done } }),
  };
}

/**
 * The card's at-rest checkbox (a `persistent` item action, so it is painted in
 * every card's footer, not only on hover). The row already carries `done` —
 * the gallery joins the statuses onto the list before it renders.
 */
export function DoneCardAction({ row }: ItemActionProps<PrototypeGalleryRow>) {
  const { pending, setDone } = useSetPrototypeDone();
  return (
    <ControlSizeProvider size="sm">
      <IconButton
        icon={row.done ? MdCheckCircle : MdRadioButtonUnchecked}
        label={row.done ? "Done — mark as not done" : "Mark as done"}
        aria-pressed={row.done}
        variant="ghost"
        loading={pending}
        className={row.done ? "text-primary" : undefined}
        onClick={(e) => {
          // The card's own click opens the prototype; ticking it must not.
          e.stopPropagation();
          setDone(row.name, !row.done);
        }}
      />
    </ControlSizeProvider>
  );
}

/**
 * The detail pane header's Done toggle. One fixed label and a same-size glyph
 * in both states, so toggling it never changes the header's width (the
 * version arrows must not move — see `prototypes-detail.actions.jsonc`).
 * Disabled until the statuses are known, rather than claiming "not done".
 */
export function DoneHeaderAction() {
  const { name } = usePrototypeDetail();
  const statuses = useResource(prototypeStatusesResource);
  const { pending, setDone } = useSetPrototypeDone();
  if (statuses.pending) {
    return (
      <Button variant="outline" disabled>
        <MdRadioButtonUnchecked />
        Done
      </Button>
    );
  }
  const done = statusOf(statuses.data, name).done;
  return (
    <Button
      variant={done ? "secondary" : "outline"}
      aria-pressed={done}
      loading={pending}
      onClick={() => setDone(name, !done)}
    >
      {done ? <MdCheckCircle /> : <MdRadioButtonUnchecked />}
      Done
    </Button>
  );
}
