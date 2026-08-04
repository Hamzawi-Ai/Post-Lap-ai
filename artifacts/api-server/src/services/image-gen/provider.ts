import { getGemini } from "../ai/client";

/**
 * Provider-agnostic image generation pipeline.
 *
 * The active provider is selected ONCE from configuration
 * (`IMAGE_PROVIDER=gemini | nanobanana | …`) — never by automatic fallback —
 * so provider-specific issues are not hidden and swapping providers in the
 * future requires no changes to Hamzawi, the frontend, or the app flow:
 * implement a new provider class and register it in getImageProvider().
 */

export interface GenerateImageParams {
  prompt: string;
  referenceImages?: Array<{ mimeType: string; data: string }>;
}

export interface GeneratedImage {
  mimeType: string;
  data: string;
}

export interface ImageProvider {
  readonly id: string;
  isAvailable(): boolean;
  generate(params: GenerateImageParams): Promise<GeneratedImage | null>;
}

class GeminiImageProvider implements ImageProvider {
  readonly id = "gemini";
  private static readonly MODEL = "gemini-2.5-flash-image";

  isAvailable(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  async generate({ prompt, referenceImages = [] }: GenerateImageParams): Promise<GeneratedImage | null> {
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
      { text: prompt },
    ];
    for (const img of referenceImages.slice(0, 6)) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }

    const gemini = getGemini();
    const result = await gemini.models.generateContent({
      model: GeminiImageProvider.MODEL,
      contents: [{ role: "user", parts }],
      config: { responseModalities: ["IMAGE", "TEXT"] },
    });

    const generatedParts = result.candidates?.[0]?.content?.parts ?? [];
    const imagePart = generatedParts.find(
      (p): p is { inlineData: { mimeType: string; data: string } } =>
        typeof p === "object" && p !== null && "inlineData" in p && !!p.inlineData
    );
    if (!imagePart?.inlineData?.data) return null;
    return { mimeType: imagePart.inlineData.mimeType, data: imagePart.inlineData.data };
  }
}

// Placeholder for a future provider — keeps the pipeline config-driven without
// hiding the fact that it is not implemented yet (isAvailable() = false → 503).
class NanoBananaImageProvider implements ImageProvider {
  readonly id = "nanobanana";
  isAvailable(): boolean {
    return false;
  }
  async generate(): Promise<GeneratedImage | null> {
    throw new Error("Image provider 'nanobanana' is not implemented yet.");
  }
}

const geminiProvider = new GeminiImageProvider();
const nanoBananaProvider = new NanoBananaImageProvider();

export function getImageProvider(): ImageProvider {
  const provider = (process.env.IMAGE_PROVIDER ?? "gemini").trim().toLowerCase();
  switch (provider) {
    case "nanobanana":
      return nanoBananaProvider;
    case "gemini":
      return geminiProvider;
    default:
      throw new Error(`Unknown IMAGE_PROVIDER: "${provider}". Supported: gemini, nanobanana.`);
  }
}

export function isImageGenAvailable(): boolean {
  try {
    return getImageProvider().isAvailable();
  } catch {
    return false;
  }
}
