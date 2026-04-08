export function DummyDetail({ itemId, label }: { itemId: string; label: string }) {
  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-2">{label}</h2>
      <p className="text-sm text-muted-foreground">
        Item ID: <code className="bg-muted px-1 rounded">{itemId}</code>
      </p>
    </div>
  );
}
