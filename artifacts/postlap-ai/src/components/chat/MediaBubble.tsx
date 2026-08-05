import type { ChatRenderer } from "./rendererRegistry";
import type { MediaBlock } from "@/lib/messages/types";

/**
 * User-attached media preview (e.g. the ad image being checked). Simple
 * thumbnail + caption, extracted verbatim from the chat's inline rendering.
 */
const MediaBubble: ChatRenderer = ({ block }) => {
  const m = block as MediaBlock;
  return (
    <div>
      <img
        src={m.url}
        alt="ad preview"
        className="w-full max-h-48 object-cover cursor-zoom-in"
        onClick={() => window.open(m.url, "_blank")}
      />
      <div className="px-3 py-2">
        <p className="text-xs opacity-80">{m.text}</p>
        <p className="text-[10px] opacity-50 mt-0.5">{m.time}</p>
      </div>
    </div>
  );
};

export default MediaBubble;
