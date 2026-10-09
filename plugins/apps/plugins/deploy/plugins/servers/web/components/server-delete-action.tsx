import {
  useEndpointMutation,
  EndpointError,
} from "@plugins/infra/plugins/endpoints/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { openDialog } from "@plugins/primitives/plugins/overlay/plugins/imperative-dialog/web";
import type { Server } from "../../shared";
import { deleteServer } from "../../shared/endpoints";
import { DeleteServerDialog } from "./delete-server-dialog";

/**
 * Delete, as the identity section's header `action` rather than a row inside its
 * body — the destructive verb on a server stays reachable with the card shut,
 * and the body is only the fields.
 */
export function ServerDeleteAction({ server }: { server: Server }) {
  const remove = useEndpointMutation(deleteServer);

  function handleDelete() {
    // Fire-and-forget: don't return the openDialog promise, or the button would
    // auto-pend for the dialog's whole open lifetime. `loading={…isPending}`
    // reflects the actual delete instead.
    void openDialog(
      (close) => (
        <DeleteServerDialog
          server={server}
          onCancel={close}
          onConfirm={() =>
            remove
              .mutateAsync({ params: { id: server.id } })
              .then(() => close())
              .catch((err: unknown) => {
                // Expected delete failure — the global toast already reported it;
                // keep the dialog open so the user can retry or cancel.
                if (err instanceof EndpointError) return;
                throw err;
              })
          }
        />
      ),
      { size: "sm" },
    );
  }

  return (
    <Button
      variant="link"
      loading={remove.isPending}
      onClick={handleDelete}
      className="text-destructive hover:text-destructive"
    >
      Delete
    </Button>
  );
}
