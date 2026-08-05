/**
 * UX-1 — Message Types.
 *
 * A chat message is modelled as a single, typed "block". The render loop never
 * switches on free-form fields; it asks the RendererRegistry for a renderer by
 * block.type. This makes the presentation layer future-proof: new content
 * kinds (e.g. a TOOL_RESULT card from the P2 Executor) are added by defining a
 * type + registering a renderer, with no changes to the message loop.
 *
 * Current backend behaviour is fully preserved:
 *  - a plain Hamzawi reply            → text
 *  - reply with imageUrl              → generated_image
 *  - a user-attached image preview    → media
 *  - "copy" / "check_result" blocks   → registered + dormant until the
 *    backend emits them (TOOL_RESULT routing is NOT active yet).
 */

export type ChatBlockType = "text" | "generated_image" | "check_result" | "copy" | "media";

export interface CheckReport {
  status: string;
  score: number;
  message?: string;
  violations?: Array<{ type: string; reason: string; severity: string }>;
  suggestions?: string[];
}

export interface BaseChatBlock {
  id: string;
  from: "hamzawi" | "user";
  time: string;
  type: ChatBlockType;
}

export interface TextBlock extends BaseChatBlock {
  type: "text";
  text: string;
}

/** Generated branded post (download + regenerate actions). */
export interface GeneratedImageBlock extends BaseChatBlock {
  type: "generated_image";
  url: string;
  description?: string;
  /** Caption shown under the image (the AI reply text). */
  text?: string;
}

/** Ad-check result card. Not emitted yet — check-in-chat activates later. */
export interface CheckResultBlock extends BaseChatBlock {
  type: "check_result";
  result: CheckReport;
}

/** Ad copy / generated text with a copy-to-clipboard affordance. */
export interface CopyBlock extends BaseChatBlock {
  type: "copy";
  text: string;
}

/** User-attached media preview (e.g. the ad being checked). */
export interface MediaBlock extends BaseChatBlock {
  type: "media";
  text: string;
  url: string;
}

export type ChatBlock =
  | TextBlock
  | GeneratedImageBlock
  | CheckResultBlock
  | CopyBlock
  | MediaBlock;

/** Blocks that render as full-bleed cards (no text-bubble padding). */
export const CARD_BLOCK_TYPES: ReadonlySet<ChatBlockType> = new Set([
  "generated_image",
  "check_result",
  "media",
]);

/** Loose input shape kept for compatibility with legacy call sites. */
export interface BlockExtra {
  imageUrl?: string;
  isGeneratedPost?: boolean;
  generatedDescription?: string;
  time?: string;
}
