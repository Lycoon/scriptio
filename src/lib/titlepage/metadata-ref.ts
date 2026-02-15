/**
 * Module-level mutable store for title page metadata.
 *
 * Updated synchronously during render by useTitlePageEditor() so that
 * format node views always read the latest project title / author —
 * regardless of TipTap storage timing or React effect scheduling.
 *
 * Lives in its own module to avoid circular imports between editor.ts
 * and the node definitions in nodes/format-marks.ts.
 */
export const titlePageMetadataRef = { projectTitle: "", projectAuthor: "" };
