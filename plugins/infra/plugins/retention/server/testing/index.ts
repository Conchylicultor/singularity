// The sweep body a retention job runs, for a suite that drives a real sweep
// against its own throwaway database (the reports.list oracle sweeps a
// produced table through it).
export { sweepExpired } from "../internal/define-retention";
