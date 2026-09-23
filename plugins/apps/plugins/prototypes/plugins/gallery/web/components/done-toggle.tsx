import {
  MdCheckBox,
  MdCheckBoxOutlineBlank,
  MdCheckCircle,
  MdRadioButtonUnchecked,
} from "react-icons/md";
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
import { usePrototypeDetail } from "@plugins/apps/plugins/prototypes/plugins/canvas/web";
import type { PrototypeGalleryRow } from "../slots";

// Marking a prototype Done: one shared record per prototype (`files`'
// `prototypes.statuses`, `_status/<id>.json`), toggled from the gallery card and
// from the detail pane's header. A failed write surfaces through the endpoint
// layer's global error toast; the checkbox keeps showing the stored value, since
// it reads the resource the server re-broadcasts on every write.

/** Set one prototype's Done flag. */
export function useSetPrototypeDone(): {
  pending: boolean;
  setDone: (name: string, done: boolean) => void;
} {
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
 * The detail pane header's Done toggle: a checkbox icon beside the copy-id
 * icon, a same-size glyph in both states so ticking it never moves the header.
 * Disabled until the statuses are known, rather than claiming "not done".
 */
export function DoneHeaderAction() {
  const { name } = usePrototypeDetail();
  const statuses = useResource(prototypeStatusesResource);
  const { pending, setDone } = useSetPrototypeDone();
  if (statuses.pending) {
    return (
      <IconButton icon={MdCheckBoxOutlineBlank} label="Mark as done" disabled />
    );
  }
  const done = statusOf(statuses.data, name).done;
  return (
    <IconButton
      icon={done ? MdCheckBox : MdCheckBoxOutlineBlank}
      label={done ? "Done — click to reopen" : "Mark as done"}
      aria-pressed={done}
      loading={pending}
      className={done ? "text-success" : undefined}
      onClick={() => setDone(name, !done)}
    />
  );
}
