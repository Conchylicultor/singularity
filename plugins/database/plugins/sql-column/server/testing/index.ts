// The error a decoded column throws on a value its schema refuses, so a suite
// can assert that a read or a write was refused.
export { SqlColumnError } from "../internal/errors";
