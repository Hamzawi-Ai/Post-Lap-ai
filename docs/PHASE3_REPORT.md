# Phase 3 Report — Repair the AI Pipeline: Uploaded Images Always Reach the AI

Date: 2026-08-08
Scope: **AI pipeline repair.** Fix root causes only. No database, API, service,
internal class, route, URL, endpoint, or file names were changed; no redirects,
file moves, or refactors were introduced. The only functional changes are the
fixes described below.

## Problem

When a user uploaded an image (via the chat paperclip 📎 or the ad-check scan
button), the assistant could not see it and would answer things like
"لا أستطيع رؤية الصورة" / "I cannot see the image".

## Root cause

The `/api/hamzawi/chat` turn — the *only* place the assistant receives
context — never carried the user's image:

1. **Frontend never sent the image.** `sendMessage()` posted only
   `{ message, checkReport, conversationId }`. The ad-check image went to
   `/api/check` (a separate vision call) and the paperclip image went to
   `/api/hamzawi/upload-asset` (persisted as a brand asset), but neither was
   attached to the chat turn itself.
2. **Backend ignored any attachment.** The chat route destructured only
   `message / checkReport / isInit / conversationId`.
3. **Vision was intent-gated AND asset-gated.** The model only received images
   when `needsVision` (a regex match on the message text) **and**
   `hasBrandImages` (pre-existing saved brand assets) were both true. A freshly
   uploaded image is not yet in the brand-asset set, and the ad-check
   follow-up message ("تحقق من نتيجة فحص الإعلان…") does not match the vision
   intent patterns — so the turn ran on the text model with no image at all.
4. **History stripped images.** `historyForAI` kept only text, so an image from
   an earlier turn was never visible in later turns either.

## Changes applied

### Backend — `artifacts/api-server/src/routes/hamzawi.ts`

| Location | Change |
| --- | --- |
| Imports | Added `uploadsUrlToBase64` (assetReader) and `OpenAI` type import |
| Body schema | `POST /api/hamzawi/chat` now accepts `attachment: { url } \| { dataUrl } \| null` |
| `resolveAttachment()` | Resolves a `/uploads/…` URL (read from disk, path-traversal contained) or a `data:image/…` base64 URL into image data. Never throws — a bad attachment degrades to text |
| `buildAttachmentMarker()` | Persists the attachment as `%%ATTACHED_IMAGE%%{...}%%END%%` inside the stored user message (URL form when available, base64 data-URL otherwise) — no schema change |
| `buildHistoryForAI()` | Replaces the old text-only history builder: strips `%%GENERATED_IMAGE%%` markers as before, but re-expands `%%ATTACHED_IMAGE%%` markers into `image_url` content parts (URL form re-read from disk per turn) so later turns keep seeing uploaded images |
| Turn assembly | An attached image **unconditionally routes the turn to `VISION_MODEL`** and is added as an `image_url` content part — intent detection no longer gates it. Brand images are still attached only when the original intent gate (`needsVision && hasBrandImages`) holds, preserving existing behaviour |
| Anti-hallucination guard | When an image is attached, an explicit instruction is appended to the user text: the image is in front of the model — analyse it directly, never claim it cannot see it |
| Message persistence | The stored user message now includes the attachment marker, so the image survives reload and later turns |

### Frontend — `artifacts/postlap-ai/src/components/HamzawiChat.tsx`

| Location | Change |
| --- | --- |
| New refs | `pendingAttachmentRef` (image to send with the next message) and `adCheckFileRef` (last ad-check file) |
| `fileToDataUrl()` | Reads a `File` into a base64 data URL |
| `sendMessage(text, checkReport?, attachment?)` | Sends the attachment with the request; a pending paperclip attachment is consumed one-shot by the next message |
| `handleChatAttach()` | After a successful paperclip upload, the returned `/uploads/…` URL becomes the pending attachment for the next chat message |
| `handleAdCheckFile()` | Stores the chosen file so the auto follow-up turn can re-attach it |
| Check-result effect | The auto "تحقق من نتيجة فحص الإعلان…" turn now attaches the checked ad image (base64 data URL), so the assistant sees the actual ad, not just the text report |

### Frontend — `artifacts/postlap-ai/src/lib/messages/parser.ts`

| Location | Change |
| --- | --- |
| `parseStoredContent()` | Strips `%%ATTACHED_IMAGE%%…%%END%%` markers on history reload so they never appear as raw text in chat bubbles |

## Untouched (by design)

- All `/api/hamzawi/*`, `/api/check`, `/api/image-gen`, `/api/generate-text`
  endpoint paths, request/response shapes (other than the new optional
  `attachment` field), DB schema, service names, and file names.
- The `needsVision` intent detection and the brand-asset vision gating for
  non-attachment turns (behaviour preserved).
- The `/api/check` pipeline, the Gemini image-generation pipeline, and the
  brand brain.
- No redirects, no file moves, no refactors, no new endpoints.

## Verification

- `pnpm typecheck` — passed (api-server and postlap-ai)
- `pnpm build` — passed (api-server and postlap-ai)
- `git diff` reviewed: 3 files changed, 201 insertions, 24 deletions
