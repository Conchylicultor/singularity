const KEY = "singularity.tabId";

export function getTabId(): string {
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(KEY, id);
    }
    return id;
    // eslint-disable-next-line promise-safety/no-bare-catch -- best-effort sessionStorage access; any failure (disabled/blocked storage, private mode) must degrade to a stable sentinel so attribution never throws in a caller's hot path
  } catch {
    return "no-tab-id";
  }
}
