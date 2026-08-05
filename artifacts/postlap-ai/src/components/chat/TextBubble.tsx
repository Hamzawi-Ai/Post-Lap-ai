import type { ChatRenderer } from "./rendererRegistry";
import type { TextBlock } from "@/lib/messages/types";

/**
 * Plain text bubble (the default renderer for ordinary replies).
 * Whitespace preserved so multi-line AI output keeps its layout.
 */
const TextBubble: ChatRenderer = ({ block, ctx }) => {
  const m = block as TextBlock;
  return (
    <>
      {m.text}
      <p className="text-[10px] opacity-50 mt-1 text-left">{m.time}</p>
    </>
  );
};

export default TextBubble;
