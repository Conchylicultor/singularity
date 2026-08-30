/**
 * This arm's discriminator value.
 *
 * Spelled once because it is load-bearing in four places that must agree: the
 * `defineRunArmFields` namespace prefix, the `defineRunKind` registration, the
 * `Runs.Row` dispatch key, and the `run.kind` guard every field accessor makes
 * before decoding a row as one of this arm's.
 */
export const DEPLOY_RUN_KIND = "deploy";
