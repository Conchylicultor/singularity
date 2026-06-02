import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { toast } from "@plugins/notifications/web";
import { Button } from "@/components/ui/button";
import { flushQuestion } from "../../shared";

export function AnswerHereButton({
  conversationId,
}: {
  conversationId: string;
  waitingFor: string;
}) {
  const m = useEndpointMutation(flushQuestion, {
    onError: (err) =>
      toast({
        type: "conversation",
        description: `Flush failed: ${err.message}`,
        variant: "error",
      }),
  });

  return (
    <div className="flex items-center gap-2 text-xs text-warning/70">
      <span>Content pending in terminal — waiting for your input</span>
      <Button
        size="sm"
        disabled={m.isPending}
        onClick={() => m.mutate({ params: { id: conversationId } })}
      >
        {m.isPending ? "Opening…" : "Answer here"}
      </Button>
    </div>
  );
}
