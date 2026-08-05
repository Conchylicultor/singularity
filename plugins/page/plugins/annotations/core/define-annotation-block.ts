import type { AnyZodObject, z } from "zod";
import {
  defineContainerBlock,
  type ContainerBlockOptions,
  type RejectTextBearing,
} from "@plugins/page/plugins/container/core";
import type { BlockAudience, BlockHandle } from "@plugins/page/plugins/editor/core";

/**
 * The declaration surface of an annotation: a void container's, plus the one
 * thing an annotation has that an ordinary container does not.
 *
 * Everything else is FORWARDED, never restated — `ContainerBlockOptions` is
 * intersected rather than copied, so a new container option (or a removed one)
 * reaches annotations with no edit here, and the two surfaces cannot drift into
 * disagreeing about what a container may declare.
 */
export type AnnotationBlockOptions<S extends AnyZodObject> = ContainerBlockOptions<S> & {
  /**
   * Who this card's content is FOR — `"agent"` for the three cards addressed TO
   * or written BY an agent (`/context`, `/todo`, `/agent`), `"human"` for the one
   * withheld from them (`/private`).
   *
   * REQUIRED, and that is the entire point of this factory existing. See
   * `defineAnnotationBlock` below.
   */
  audience: BlockAudience;
};

/**
 * A `BlockHandle` that PROVES its audience was declared: the field is required
 * here, where `BlockHandle.audience` is optional (an ordinary paragraph declares
 * none). `& { text?: undefined }` is `defineContainerBlock`'s own voidness proof,
 * carried through — see its return-type note for why weakening it breaks every
 * container's `Editor.Block` registration.
 */
export type AnnotationBlockHandle<T> = BlockHandle<T> & {
  text?: undefined;
  audience: BlockAudience;
};

/**
 * Define an ANNOTATION block type: a void container that carries part of the
 * page's human↔agent side-channel, and therefore declares who its content is
 * for.
 *
 * It is `defineContainerBlock` plus exactly one REQUIRED field, and the
 * requirement is the whole mechanism:
 *
 * > **An annotation cannot be unmarked.** There is no default to leak through.
 *
 * The fail-safe direction the family doc demands ("the failure mode of a future
 * annotation is *the agent didn't see it*, never *the private card leaked*") is
 * therefore reached by making the unmarked state UNREPRESENTABLE rather than by
 * defaulting it. A default would be a value some consumer eventually has to
 * interpret; a required field is a compile error at the one site that knows the
 * answer. Its enforcement has two halves, neither sufficient alone:
 *
 * - this signature, which a new annotation written through this factory cannot
 *   satisfy without answering the question;
 * - the `annotations:audience-declared` check, which is what stops a new
 *   annotation from reaching for `defineContainerBlock` directly and quietly
 *   being an ordinary container — the case the signature cannot see.
 *
 * `audience` is NOT threaded through `ContainerBlockOptions`, deliberately. A
 * callout or a quote has no audience — they are ordinary prose — so widening the
 * container surface would both invite a meaningless declaration and destroy the
 * check's discriminator: presence of `audience` on a handle is exactly the proof
 * that it came through here, because nothing else can set it.
 */
export function defineAnnotationBlock<S extends AnyZodObject>(
  opts: AnnotationBlockOptions<S> & RejectTextBearing<S>,
): AnnotationBlockHandle<z.infer<S>> {
  // `opts` is passed WHOLE rather than destructured: `RejectTextBearing<S>` is an
  // unresolved conditional while `S` is generic, and a rest element over it is not
  // an object type TypeScript can spread. `defineBlock` builds the handle from a
  // fixed field list, so the extra `audience` key riding along is inert there —
  // this function is the one place it is installed, which is what keeps "only the
  // annotation factory sets an audience" true.
  return { ...defineContainerBlock(opts), audience: opts.audience };
}
