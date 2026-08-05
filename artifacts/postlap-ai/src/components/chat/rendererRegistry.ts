/**
 * UX-1 — Renderer Registry.
 *
 * The chat message loop renders exclusively through this registry: it looks up
 * a renderer by ChatBlock.type and renders it. Registering a new block type
 * (e.g. a P2 TOOL_RESULT card) is a single register() call — the loop and the
 * parser stay untouched.
 */
import type { ComponentType } from "react";
import type { ChatBlock, ChatBlockType } from "@/lib/messages/types";

/** Strings shared by chat renderers (satisfied structurally by the chat i18n). */
export interface ChatI18n {
  download: string;
  regenerate: string;
  copy: string;
  copied: string;
}

export interface ChatRendererContext {
  lang: "ar" | "en";
  t: ChatI18n;
  onDownload: (url: string) => void;
  onRegenerate: () => void;
  onCopy: (text: string) => void;
  /** True while a post generation is in flight (mirrors legacy disabled state). */
  busy?: boolean;
}

export type ChatRenderer = ComponentType<{
  block: ChatBlock;
  ctx: ChatRendererContext;
}>;

export class RendererRegistry {
  private renderers = new Map<ChatBlockType, ChatRenderer>();

  register(type: ChatBlockType, renderer: ChatRenderer): void {
    if (this.renderers.has(type)) {
      throw new Error(`Renderer already registered for block type: ${type}`);
    }
    this.renderers.set(type, renderer);
  }

  registerAll(entries: ReadonlyArray<[ChatBlockType, ChatRenderer]>): void {
    for (const [type, renderer] of entries) this.register(type, renderer);
  }

  get(type: ChatBlockType): ChatRenderer | undefined {
    return this.renderers.get(type);
  }

  has(type: ChatBlockType): boolean {
    return this.renderers.has(type);
  }

  list(): ChatBlockType[] {
    return [...this.renderers.keys()];
  }
}

export const chatRendererRegistry = new RendererRegistry();
