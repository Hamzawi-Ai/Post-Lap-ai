import { describe, it, expect } from "vitest";
import { parseStoredContent, storedContentToBlock } from "./parser";

// ---------------------------------------------------------------------------
// parseStoredContent
// ---------------------------------------------------------------------------

describe("parseStoredContent", () => {
  it("returns plain text when no markers are present", () => {
    const result = parseStoredContent("Hello world");
    expect(result.text).toBe("Hello world");
    expect(result.imageUrl).toBeUndefined();
    expect(result.attachedImageUrl).toBeUndefined();
  });

  it("extracts a GENERATED_IMAGE url and strips the marker from text", () => {
    const content =
      'Here is your image%%GENERATED_IMAGE%%{"url":"/uploads/img.png","description":"A cat"}%%END%%';
    const result = parseStoredContent(content);
    expect(result.text).toBe("Here is your image");
    expect(result.imageUrl).toBe("/uploads/img.png");
    expect(result.generatedDescription).toBe("A cat");
    expect(result.attachedImageUrl).toBeUndefined();
  });

  // ---- ATTACHED_IMAGE with url ----

  it("extracts an ATTACHED_IMAGE url and strips the marker from text", () => {
    const content =
      'Check this%%ATTACHED_IMAGE%%{"url":"/uploads/ad.jpg"}%%END%%';
    const result = parseStoredContent(content);
    expect(result.text).toBe("Check this");
    expect(result.attachedImageUrl).toBe("/uploads/ad.jpg");
    expect(result.imageUrl).toBeUndefined();
  });

  it("extracts an ATTACHED_IMAGE with no user text alongside the marker", () => {
    const content = '%%ATTACHED_IMAGE%%{"url":"/uploads/solo.png"}%%END%%';
    const result = parseStoredContent(content);
    expect(result.text).toBe("");
    expect(result.attachedImageUrl).toBe("/uploads/solo.png");
  });

  // ---- ATTACHED_IMAGE with data (data-URL fallback) ----

  it("uses the data field as attachedImageUrl when no url is present", () => {
    const dataBlob = "data:image/png;base64,abc123";
    const content = `%%ATTACHED_IMAGE%%{"data":"${dataBlob}"}%%END%%`;
    const result = parseStoredContent(content);
    expect(result.attachedImageUrl).toBe(dataBlob);
    expect(result.imageUrl).toBeUndefined();
  });

  it("prefers url over data when both are present", () => {
    const content =
      '%%ATTACHED_IMAGE%%{"url":"/uploads/real.png","data":"data:image/png;base64,xyz"}%%END%%';
    const result = parseStoredContent(content);
    expect(result.attachedImageUrl).toBe("/uploads/real.png");
  });

  it("returns plain text when the ATTACHED_IMAGE JSON is malformed", () => {
    const content = "%%ATTACHED_IMAGE%%{notjson}%%END%%";
    const result = parseStoredContent(content);
    expect(result.text).toBe("");
    expect(result.attachedImageUrl).toBeUndefined();
  });

  it("returns plain text when the ATTACHED_IMAGE payload has neither url nor data", () => {
    const content = '%%ATTACHED_IMAGE%%{"other":"value"}%%END%%';
    const result = parseStoredContent(content);
    expect(result.attachedImageUrl).toBeUndefined();
    expect(result.text).toBe("");
  });

  it("GENERATED_IMAGE takes priority over ATTACHED_IMAGE when both appear", () => {
    const content =
      '%%GENERATED_IMAGE%%{"url":"/gen.png"}%%END%%%%ATTACHED_IMAGE%%{"url":"/att.jpg"}%%END%%';
    const result = parseStoredContent(content);
    expect(result.imageUrl).toBe("/gen.png");
    expect(result.attachedImageUrl).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// storedContentToBlock
// ---------------------------------------------------------------------------

describe("storedContentToBlock", () => {
  const FROM = "user" as const;
  const TIME = "10:00";

  it("produces a text block for plain content", () => {
    const block = storedContentToBlock("Hello", FROM, TIME);
    expect(block.type).toBe("text");
    if (block.type === "text") expect(block.text).toBe("Hello");
  });

  it("produces a generated_image block for GENERATED_IMAGE content", () => {
    const content =
      'Caption%%GENERATED_IMAGE%%{"url":"/gen.png","description":"sky"}%%END%%';
    const block = storedContentToBlock(content, FROM, TIME);
    expect(block.type).toBe("generated_image");
    if (block.type === "generated_image") {
      expect(block.url).toBe("/gen.png");
      expect(block.description).toBe("sky");
      expect(block.text).toBe("Caption");
    }
  });

  it("produces a media block for ATTACHED_IMAGE with url", () => {
    const content =
      'Check this%%ATTACHED_IMAGE%%{"url":"/uploads/ad.jpg"}%%END%%';
    const block = storedContentToBlock(content, FROM, TIME);
    expect(block.type).toBe("media");
    if (block.type === "media") {
      expect(block.url).toBe("/uploads/ad.jpg");
      expect(block.text).toBe("Check this");
    }
  });

  it("produces a media block for ATTACHED_IMAGE with data-URL", () => {
    const dataBlob = "data:image/png;base64,abc123";
    const content = `%%ATTACHED_IMAGE%%{"data":"${dataBlob}"}%%END%%`;
    const block = storedContentToBlock(content, FROM, TIME);
    expect(block.type).toBe("media");
    if (block.type === "media") {
      expect(block.url).toBe(dataBlob);
      expect(block.text).toBe("");
    }
  });

  it("falls back to a text block when ATTACHED_IMAGE has no url or data", () => {
    const content = '%%ATTACHED_IMAGE%%{"other":"nope"}%%END%%';
    const block = storedContentToBlock(content, FROM, TIME);
    expect(block.type).toBe("text");
  });

  it("preserves user text as the media block caption", () => {
    const content =
      'My caption here%%ATTACHED_IMAGE%%{"url":"/uploads/img.png"}%%END%%';
    const block = storedContentToBlock(content, "user", TIME);
    expect(block.type).toBe("media");
    if (block.type === "media") {
      expect(block.text).toBe("My caption here");
    }
  });
});
