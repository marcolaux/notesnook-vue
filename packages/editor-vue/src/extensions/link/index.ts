export { Link } from "./link";
export type { LinkOptions, LinkAttributes } from "./link";
export { insertNoteLink, setNoteLink, linkMarkAttrs } from "./insert";
export type { NoteLinkPayload } from "./insert";
export {
  createInternalLink,
  parseInternalLink,
  isInternalLink,
  isNoteLink,
  noteIdFromLink,
  blockIdFromLink,
  NN_PROTOCOL
} from "./internal-link";
export type { InternalLinkType, InternalLinkParams, ParsedInternalLink } from "./internal-link";