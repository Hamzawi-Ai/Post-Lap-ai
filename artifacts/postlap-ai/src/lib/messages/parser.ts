/**
 * UX-1 — Typed message parsing.
 *
 * Turns raw wire formats into typed ChatBlocks:
 *  - persisted assistant content (the %%GENERATED_IMAGE%%{...}%%END%% marker)
 *  - live API replies ({ reply, imageUrl?, generatedDescription?, block? })
 *
 * The `block` field is the forward-compatible channel for P2: when the backend
 * starts emitting typed tool results it sets `block: "check_result" | "copy"`
 * and the matching renderers (already registered) light up automatically.
 * Until then, replies without a `block` field map exactly as before.
 */
import type { BlockExtra, ChatBlock, CheckReport } from "./types";

let _idCounter = 0;
export function nextBlockId(): string {
  _idCounter += 1;
  return `blk-${Date.now().toString(36)}-${_idCounter}`;
}

/** Parses persisted Hamzawi assistant content (legacy marker format). */
export function parseStoredContent(content: string): {
  text: string;
  imageUrl?: string;
  generatedDescription?: string;
} {
  const match = content.match(/%%GENERATED_IMAGE%%(\{[\s\S]*?\})%%END%%/);
  const text = content.replace(/%%GENERATED_IMAGE%%[\s\S]*?%%END%%/g, "").trim();
  if (!match) return { text };
  try {
    const parsed = JSON.parse(match[1]) as { url?: string; description?: string };
    return { text, imageUrl: parsed.url, generatedDescription: parsed.description };
  } catch {
    return { text };
  }
}

export function storedContentToBlock(
  content: string,
  from: "hamzawi" | "user",
  time: string,
): ChatBlock {
  const parsed = parseStoredContent(content);
  if (parsed.imageUrl) {
    return {
      id: nextBlockId(),
      from,
      time,
      type: "generated_image",
      url: parsed.imageUrl,
      description: parsed.generatedDescription,
      text: parsed.text,
    };
  }
  return { id: nextBlockId(), from, time, type: "text", text: parsed.text };
}

export interface ApiChatReply {
  reply: string;
  imageUrl?: string;
  generatedDescription?: string;
  /** Forward-compatible typed emission (P2). Absent in current responses. */
  block?: "text" | "generated_image" | "check_result" | "copy" | "media";
  checkResult?: CheckReport | null;
}

/** Maps a live `/api/hamzawi/chat` reply into a typed ChatBlock. */
export function replyToBlock(
  data: ApiChatReply,
  from: "hamzawi" | "user",
  time: string,
): ChatBlock {
  if (data.block === "check_result" && data.checkResult) {
    return { id: nextBlockId(), from, time, type: "check_result", result: data.checkResult };
  }
  if (data.block === "copy") {
    return { id: nextBlockId(), from, time, type: "copy", text: data.reply };
  }
  if (data.imageUrl) {
    return {
      id: nextBlockId(),
      from,
      time,
      type: "generated_image",
      url: data.imageUrl,
      description: data.generatedDescription,
      text: data.reply,
    };
  }
  return { id: nextBlockId(), from, time, type: "text", text: data.reply };
}

/**
 * Builds a ChatBlock from the legacy { text, extra } shape still used by
 * call sites (addHamzawi, ad-check previews, generated-post results).
 */
export function chatBlock(
  from: "hamzawi" | "user",
  text: string,
  extra?: BlockExtra,
): ChatBlock {
  const time = extra?.time ?? new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
  if (extra?.imageUrl && extra?.isGeneratedPost) {
    return {
      id: nextBlockId(),
      from,
      time,
      type: "generated_image",
      url: extra.imageUrl,
      description: extra.generatedDescription,
      text,
    };
  }
  if (extra?.imageUrl) {
    return { id: nextBlockId(), from, time, type: "media", text, url: extra.imageUrl };
  }
  return { id: nextBlockId(), from, time, type: "text", text };
}
