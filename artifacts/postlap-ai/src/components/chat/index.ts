/**
 * UX-1 — default chat renderer set.
 *
 * Registering every block type in one place keeps the message loop a pure
 * registry lookup. P2 adds new tool-result types here (single line each).
 */
import { chatRendererRegistry } from "./rendererRegistry";
import TextBubble from "./TextBubble";
import GeneratedImageCard from "./GeneratedImageCard";
import CheckCard from "./CheckCard";
import CopyBlock from "./CopyBlock";
import MediaBubble from "./MediaBubble";

chatRendererRegistry.registerAll([
  ["text", TextBubble],
  ["generated_image", GeneratedImageCard],
  ["check_result", CheckCard],
  ["copy", CopyBlock],
  ["media", MediaBubble],
]);

export { chatRendererRegistry } from "./rendererRegistry";
export type { ChatRenderer, ChatRendererContext, ChatI18n } from "./rendererRegistry";
export { default as TextBubble } from "./TextBubble";
export { default as GeneratedImageCard } from "./GeneratedImageCard";
export { default as CheckCard } from "./CheckCard";
export { default as CopyBlock } from "./CopyBlock";
export { default as MediaBubble } from "./MediaBubble";
