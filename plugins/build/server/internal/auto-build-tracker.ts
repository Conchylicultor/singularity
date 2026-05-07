let lastAutoBuildAt: string | null = null;

export function getLastAutoBuildAt(): string | null {
  return lastAutoBuildAt;
}

export function setLastAutoBuildAt(iso: string): void {
  lastAutoBuildAt = iso;
}
