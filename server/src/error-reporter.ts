// Server-level error reporter hook.
// Plugins (e.g. crashes) register a handler via setErrorReporter();
// infrastructure code (resources, jobs) calls reportServerError() to surface
// caught errors that would otherwise only hit console.error.

export interface ServerErrorReport {
  message: string;
  stack?: string | null;
  errorType?: string | null;
}

type ErrorReporter = (report: ServerErrorReport) => void;

let reporter: ErrorReporter | undefined;

export function setErrorReporter(fn: ErrorReporter): void {
  reporter = fn;
}

export function reportServerError(report: ServerErrorReport): void {
  reporter?.(report);
}
