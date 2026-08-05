import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { ChatRenderer } from "./rendererRegistry";
import type { CopyBlock as CopyBlockType } from "@/lib/messages/types";

/**
 * Ad-copy block — marketing text with a copy-to-clipboard button.
 *
 * Registered in UX-1; dormant until the backend emits typed copy blocks
 * (P2 / TOOL_RESULT routing). When active it replaces the plain text bubble
 * for copy-type content without touching the render loop.
 */
const CopyBlock: ChatRenderer = ({ block, ctx }) => {
  const m = block as CopyBlockType;
  const [copied, setCopied] = useState(false);

  return (
    <div className="relative">
      <div className="whitespace-pre-wrap pr-6">{m.text}</div>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(m.text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // clipboard unavailable — no-op, button is a convenience only
          }
        }}
        title={copied ? ctx.t.copied : ctx.t.copy}
        className="absolute top-0 right-0 p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <p className="text-[10px] opacity-50 mt-1 text-left">{m.time}</p>
    </div>
  );
};

export default CopyBlock;
