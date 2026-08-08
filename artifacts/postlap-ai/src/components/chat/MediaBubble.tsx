import { useState } from "react";
import type { ChatRenderer } from "./rendererRegistry";
import type { MediaBlock } from "@/lib/messages/types";

/**
 * User-attached media preview (e.g. the ad image being checked). Simple
 * thumbnail + caption, extracted verbatim from the chat's inline rendering.
 */
const MediaBubble: ChatRenderer = ({ block }) => {
  const m = block as MediaBlock;
  const [imgError, setImgError] = useState(false);

  return (
    <div>
      {imgError ? (
        <div className="w-full flex flex-col items-center justify-center gap-1 bg-gray-100 rounded-lg py-6 px-4 text-gray-500">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-xs text-center">Upload succeeded · preview unavailable</p>
        </div>
      ) : (
        <img
          src={m.url}
          alt="ad preview"
          className="w-full max-h-48 object-cover cursor-zoom-in"
          onClick={() => window.open(m.url, "_blank")}
          onError={() => setImgError(true)}
        />
      )}
      <div className="px-3 py-2">
        {m.text && <p className="text-xs opacity-80">{m.text}</p>}
        <p className="text-[10px] opacity-50 mt-0.5">{m.time}</p>
      </div>
    </div>
  );
};

export default MediaBubble;
