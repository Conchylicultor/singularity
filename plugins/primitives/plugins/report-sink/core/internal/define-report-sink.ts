export interface ReportSink<TBody, TResult> {
  register(fn: ((body: TBody) => TResult) | null): void;
  emit(body: TBody): TResult | undefined;
}

// A module-level soft-reporter slot. The primitive owning the sink defines its
// own neutral TBody; a domain plugin (e.g. `reports`) registers the mapping to
// report(). emit() is called on error paths, so it never throws — a throw from
// the registered handler is swallowed rather than propagated.
export function defineReportSink<TBody, TResult = void>(): ReportSink<TBody, TResult> {
  let handler: ((body: TBody) => TResult) | null = null;
  return {
    register(fn) {
      handler = fn;
    },
    emit(body) {
      try {
        return handler?.(body);
        // eslint-disable-next-line promise-safety/no-bare-catch, promise-safety/no-absorbed-failure -- reporting must never throw on the error path; a throw from the registered handler is swallowed here
      } catch {
        return undefined;
      }
    },
  };
}
