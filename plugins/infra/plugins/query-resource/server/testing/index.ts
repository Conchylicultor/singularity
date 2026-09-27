// The bounded compiler WITHOUT registering, for suites that read its output
// against their own `db`: `network/live`'s tests of the window / point
// descriptors its collections mint and of `serveCollection`'s derived specs,
// and the page editor's block-doc store. Shipping code registers through
// `windowQueryResource`.
export { compileWindowQuery } from "../internal/compile-window";
