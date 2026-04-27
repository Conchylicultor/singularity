export function WorktreeDropdown() {
  const currentHost = window.location.hostname;
  const currentWorktree = currentHost.endsWith(".localhost")
    ? currentHost.replace(/\.localhost$/, "")
    : "head";

  return (
    <span className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground">
      <span className="size-1.5 rounded-full bg-primary shrink-0" />
      {currentWorktree}
    </span>
  );
}
