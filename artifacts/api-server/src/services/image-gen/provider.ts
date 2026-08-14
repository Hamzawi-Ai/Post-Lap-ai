import { toFile } from "openai";
import { getGemini, getOpenAI } from "../ai/client";
import { DEV_STUB_IMAGE } from "./devStub";

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
  size?: string;
}

export interface GeneratedImage {
  mimeType: string;
  data: string;
}

export interface ImageProvider {
  readonly id: string;
  /** Actual model identifier used in API calls (for telemetry and pricing). */
  readonly modelId: string;
  isAvailable(): boolean;
  generate(params: GenerateImageParams): Promise<GeneratedImage | null>;
}

class GeminiImageProvider implements ImageProvider {
  readonly id = "gemini";
  readonly modelId = "gemini-2.5-flash-image";
  private static readonly MODEL = "gemini-2.5-flash-image";

  isAvailable(): boolean {
    const isProd = process.env.NODE_ENV === "production";
    const hasKey = !!(process.env.GEMINI_API_KEY || process.env.NANO_BANANA_API_KEY);
    // In development, the dev stub counts as "available" so the full pipeline
    // (brand assets → provider → save → /uploads/…) can be exercised without
    // an API key. Production without a key still returns 503.
    return hasKey || !isProd;
  }

  async generate({ prompt, referenceImages = [] }: GenerateImageParams): Promise<GeneratedImage | null> {
    if (process.env.NODE_ENV !== "production" && !process.env.GEMINI_API_KEY && !process.env.NANO_BANANA_API_KEY) {
      return { mimeType: DEV_STUB_IMAGE.mimeType, data: DEV_STUB_IMAGE.data };
    }

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

/**
 * Supported OpenAI image models. Select via OPENAI_IMAGE_MODEL env var.
 * Defaults to "gpt-image-1-mini" (cost-optimised for Beta).
 * Set OPENAI_IMAGE_MODEL=gpt-image-1 to upgrade to the full model.
 */
const SUPPORTED_OPENAI_IMAGE_MODELS = ["gpt-image-1-mini", "gpt-image-1"] as const;
const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-1-mini";

function resolveOpenAIImageModel(): string {
  const configured = (process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_OPENAI_IMAGE_MODEL).trim().toLowerCase();
  return SUPPORTED_OPENAI_IMAGE_MODELS.includes(configured as (typeof SUPPORTED_OPENAI_IMAGE_MODELS)[number])
    ? configured
    : DEFAULT_OPENAI_IMAGE_MODEL;
}

class OpenAIImageProvider implements ImageProvider {
  readonly id = "openai";

  /** Actual model in use — read from OPENAI_IMAGE_MODEL, defaults to gpt-image-1-mini. */
  get modelId(): string {
    return resolveOpenAIImageModel();
  }

  isAvailable(): boolean {
    const isProd = process.env.NODE_ENV === "production";
    const hasKey = !!process.env.OPENAI_API_KEY;
    // In development, the dev stub counts as "available" so the full pipeline
    // can be exercised without an API key. Production without a key still
    // returns 503.
    return hasKey || !isProd;
  }

  async generate({ prompt, referenceImages = [], size }: GenerateImageParams): Promise<GeneratedImage | null> {
    if (process.env.NODE_ENV !== "production" && !process.env.OPENAI_API_KEY) {
      return { mimeType: DEV_STUB_IMAGE.mimeType, data: DEV_STUB_IMAGE.data };
    }

    const model = resolveOpenAIImageModel();
    const openai = getOpenAI();

    // When reference images are provided (ad repair, branded post with logo/product),
    // use images.edit() so the model can incorporate the visual references. GPT Image
    // models (gpt-image-1 / gpt-image-1-mini) accept up to 16 reference images as an
    // array; each is sent as a real visual input (logo, product, samples, edit source)
    // rather than being described from text — this is what protects logo integrity and
    // on-asset text. The first image remains the primary edit subject.
    if (referenceImages.length > 0) {
      const imageFiles = await Promise.all(
        referenceImages.slice(0, 16).map((img, i) => {
          const ext = (img.mimeType.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "");
          return toFile(
            Buffer.from(img.data, "base64"),
            `reference-${i}.${ext}`,
            { type: img.mimeType },
          );
        }),
      );
      const editResult = await (openai.images.edit({
        model,
        image: imageFiles,
        prompt,
        n: 1,
        size: size ?? "1024x1024",
      } as Parameters<typeof openai.images.edit>[0]) as Promise<{ data?: Array<{ b64_json?: string | null }> }>);

      const editB64 = editResult.data?.[0]?.b64_json;
      if (!editB64) return null;
      return { mimeType: "image/png", data: editB64 };
    }

    // No reference images — pure text-to-image generation.
    const genResult = await (openai.images.generate({
      model,
      prompt,
      n: 1,
      size: size ?? "1024x1024",
      quality: "medium",
      output_format: "png",
    } as Parameters<typeof openai.images.generate>[0]) as Promise<{ data?: Array<{ b64_json?: string | null }> }>);

    const b64 = genResult.data?.[0]?.b64_json;
    if (!b64) return null;
    return { mimeType: "image/png", data: b64 };
  }
}

// Placeholder for a future provider — keeps the pipeline config-driven without
// hiding the fact that it is not implemented yet (isAvailable() = false → 503).
class NanoBananaImageProvider implements ImageProvider {
  readonly id = "nanobanana";
  readonly modelId = "nanobanana";
  isAvailable(): boolean {
    return false;
  }
  async generate(): Promise<GeneratedImage | null> {
    throw new Error("Image provider 'nanobanana' is not implemented yet.");
  }
}

const geminiProvider = new GeminiImageProvider();
const openaiProvider = new OpenAIImageProvider();
const nanoBananaProvider = new NanoBananaImageProvider();

export function getImageProvider(): ImageProvider {
  const provider = (process.env.IMAGE_PROVIDER ?? "openai").trim().toLowerCase();
  switch (provider) {
    case "openai":
      return openaiProvider;
    case "nanobanana":
      return nanoBananaProvider;
    case "gemini":
      return geminiProvider;
    default:
      throw new Error(`Unknown IMAGE_PROVIDER: "${provider}". Supported: openai, gemini, nanobanana.`);
  }
}

export function isImageGenAvailable(): boolean {
  try {
    return getImageProvider().isAvailable();
  } catch {
    return false;
  }
}
