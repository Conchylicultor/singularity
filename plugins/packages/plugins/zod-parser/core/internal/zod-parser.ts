import type { z } from "zod";

/**
 * A zod schema that parses **untrusted input** into a `T`.
 *
 * Use this at every parse boundary — a field schema over a jsonb column, an
 * endpoint schema over a request body, a resource schema over a WebSocket
 * payload. What arrives there is JSON nobody has checked yet, i.e. `unknown`.
 *
 * ## Why `z.ZodType<T>` is the wrong type here
 *
 * In zod v3 the type takes three parameters — `ZodType<Output, Def, Input>` —
 * and `Input` **defaults to `Output`**. So `z.ZodType<T>` expands to
 * `ZodType<T, ZodTypeDef, T>`, which claims the value going *in* is already a
 * `T`. At a parse boundary that claim is false, and it excludes every
 * combinator whose input is wider than its output: `.default()`, `.catch()`,
 * `.coerce`, `.transform()`, `.preprocess()`.
 *
 * ## The two ways that bites
 *
 * **Loud** — assigning a wide-input schema to a `ZodType<T>` *parameter* errors
 * on `_input`. Annoying, but visible; it is what makes people reach for
 * `.optional()` plus a hand-written normalizer, or an `as unknown as` cast.
 *
 * **Quiet** — where a type *infers through* `ZodType<infer U>` instead of
 * accepting it as a parameter, a wide-input schema does not error at all. It
 * silently resolves `U` to the schema's **input** type — the one where
 * defaulted keys are optional — so the consumer is handed a row type that
 * disagrees with what `.parse()` actually returns. `ZodParser<infer U>`
 * recovers the **output** type instead, which is the one that exists at
 * runtime.
 *
 * ## What it does not give up
 *
 * Runtime validation is untouched, and `Output` is still pinned to `T` exactly:
 * `.parse()` returns `T`, member access stays typed, and a schema with the
 * wrong output is still rejected. What goes opaque on a value *annotated*
 * `ZodParser<T>` is `z.input<S>` and the argument check on `.default()` — both
 * of which stay precise on the concrete schema at its definition site. Only the
 * interior of generic plumbing, whose whole job is `.parse()` on untrusted
 * JSON, sees `unknown`, which is the honest type there.
 */
export type ZodParser<T> = z.ZodType<T, z.ZodTypeDef, unknown>;
