import { useEffect, useMemo, useState } from "react";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { LaunchButtons } from "@plugins/primitives/plugins/launch/web";
import { cn } from "@/lib/utils";
import { ConversationsView } from "../slots";

const ACTIVE_VIEW_KEY = "conversations-view:active-view";

function openConversation(name: string) {
  conversationPane.open({ convId: name }, { root: true });
}

function activeIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/c\/([^/]+)/);
  return m ? decodeURIComponent(m[1]!) : null;
}

export function ConversationList() {
  const views = ConversationsView.View.useContributions();
  const ordered = useMemo(
    () => [...views].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [views],
  );

  const [activeId, setActiveId] = useState<string | null>(() =>
    activeIdFromPath(window.location.pathname),
  );

  useEffect(() => {
    const sync = () => setActiveId(activeIdFromPath(window.location.pathname));
    window.addEventListener("popstate", sync);
    window.addEventListener("shell:navigate", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("shell:navigate", sync);
    };
  }, []);

  const [activeViewId, setActiveViewId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_VIEW_KEY);
    } catch {
      return null;
    }
  });

  const activeView =
    ordered.find((v) => v.id === activeViewId) ?? ordered[0] ?? null;

  const selectView = (id: string) => {
    setActiveViewId(id);
    try {
      localStorage.setItem(ACTIVE_VIEW_KEY, id);
    } catch {}
  };

  const closeConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/conversations/${id}/close`, { method: "POST" });
  };

  const navigate = (id: string) => {
    openConversation(id);
    setActiveId(id);
  };

  const ActiveComponent = activeView?.component ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-1 px-2 pb-1">
        <LaunchButtons variant="outline" size="sm" className="w-full" />
        {ordered.length > 1 && (
          <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5">
            {ordered.map((v) => {
              const Icon = v.icon;
              const selected = activeView?.id === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => selectView(v.id)}
                  aria-pressed={selected}
                  title={v.title}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1 rounded-sm px-2 py-1 text-xs",
                    selected
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  <Icon className="size-3.5" />
                  <span>{v.title}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {ActiveComponent && (
          <ActiveComponent
            activeId={activeId}
            onNavigate={navigate}
            onCloseConversation={closeConversation}
          />
        )}
      </div>
    </div>
  );
}
