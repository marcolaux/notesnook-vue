/*
Standard Notes (Lexical) → Notesnook (TipTap HTML) converter — public surface.
Pure tree-walk with injected resolvers; no db/editor deps. See
`lexicalToTipTap.ts` for the mapping table and `types.ts` for the contracts.
*/
export { lexicalToTipTapHtml } from "./lexicalToTipTap";
export type {
  Resolvers,
  ConvertResult,
  ConvertStats,
  AttachmentInput,
  AttachmentRef,
  TagRef,
  StandardNotesItem,
  LexicalEditorState,
  LexicalNode
} from "./types";