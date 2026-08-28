/**
 * What a breadcrumb separator variant is handed — deliberately nothing.
 *
 * The separator is a glyph between two crumbs, and every variant of it (the
 * chevron, the slash) draws the same mark in the same place whatever sits on
 * either side. A prop nobody reads is a prop that can drift from what the trail
 * actually does, so the region passes none: a variant that needs to know where
 * it sits is a change to this type, made when such a variant exists.
 */
export type BreadcrumbSeparatorProps = Record<string, never>;
