export interface PluginContext {
  pluginId?: string;
  slotId?: string;
  paneId?: string;
}

export function findPluginContext(el: Element): PluginContext {
  const p = el.closest<HTMLElement>("[data-plugin-id]");
  const pane = el.closest<HTMLElement>("[data-pane-id]");
  return {
    pluginId: p?.dataset.pluginId || undefined,
    slotId: p?.dataset.slotId || undefined,
    paneId: pane?.dataset.paneId || undefined,
  };
}
