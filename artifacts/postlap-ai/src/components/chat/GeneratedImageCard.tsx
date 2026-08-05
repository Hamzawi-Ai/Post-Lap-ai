import { Download, RefreshCw } from "lucide-react";
import type { ChatRenderer } from "./rendererRegistry";
import type { GeneratedImageBlock } from "@/lib/messages/types";

/**
 * Generated branded-post card — the image plus download / regenerate actions.
 * Extracted verbatim from the chat's inline rendering (no behaviour change).
 */
const GeneratedImageCard: ChatRenderer = ({ block, ctx }) => {
  const m = block as GeneratedImageBlock;
  return (
    <div>
      <img
        src={m.url}
        alt="generated post"
        className="w-full cursor-zoom-in"
        onClick={() => window.open(m.url, "_blank")}
      />
      <div className="px-3 py-2 space-y-2">
        {m.text && <p className="text-xs text-muted-foreground">{m.text}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => ctx.onDownload(m.url)}
            className="flex-1 flex items-center justify-center gap-1 bg-primary text-primary-foreground text-xs font-bold py-1.5 rounded-lg hover:opacity-90 transition-opacity"
          >
            <Download className="w-3 h-3" />
            {ctx.t.download}
          </button>
          <button
            onClick={ctx.onRegenerate}
            disabled={ctx.busy}
            className="flex-1 flex items-center justify-center gap-1 bg-muted border border-border text-foreground text-xs py-1.5 rounded-lg hover:bg-muted/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className="w-3 h-3" />
            {ctx.t.regenerate}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GeneratedImageCard;
