export class SecretsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretsError";
  }
}

export class SecretsMainOfflineError extends SecretsError {
  constructor() {
    super(
      "Secrets: main worktree server unreachable via unix socket. Secrets live on main; the worktree cannot read or write them while main is down.",
    );
    this.name = "SecretsMainOfflineError";
  }
}

export class SecretsKeychainLockedError extends SecretsError {
  constructor(detail?: string) {
    super(
      `Secrets: encryption key unavailable${detail ? ` (${detail})` : ""}`,
    );
    this.name = "SecretsKeychainLockedError";
  }
}
