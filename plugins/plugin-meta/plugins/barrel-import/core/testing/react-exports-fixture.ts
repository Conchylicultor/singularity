/**
 * Fixture for `../stubs.test.ts`: a module that statically imports React and
 * react-dom exports the old hand-kept React stub lacked. A static named import
 * is bound at link time, so a stub missing any of these makes the import of
 * this module throw — which is exactly the drift the test pins down.
 *
 * Not imported by anything; the test loads it by path through `importBarrel`.
 */
import { use, useActionState, useInsertionEffect, useOptimistic } from "react";
import { preload } from "react-dom";

export const reactExportsSeen = {
  use,
  useActionState,
  useInsertionEffect,
  useOptimistic,
  preload,
};
