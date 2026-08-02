# HOMEPAGE_SPEC.md

Source of truth: `artifacts/postlap-ai/src/pages/home.tsx` (current at commit `2314303`).
This is a behavioral spec — when the layout changes, update this file.

---

## 1. Page structure (fixed order)

```
Header (sticky)
├─ #generate    AI Post Generation (HERO)
├─ #image-gen   AI Image Generation
├─ #check       Existing Post Check
├─ #why         Features
├─ #plans       Pricing
├─ #how         How it works        (secondary)
├─ (trust badges, stats inline)     (secondary)
├─ #agents      Agents              (secondary)
└─ #faq         FAQ                 (secondary)
```

Header nav links (in order): `#generate`, `#image-gen`, `#check`, `#plans`.
Labels are lang-conditional (`lang === "ar" ? "…" : "…"`).

## 2. Sections and purpose

### Header
Sticky, `z-50`, dark blurred bar. Left: `PostLapAI` wordmark + "فحص الإعلانات" tag.
Center: section nav (desktop only). Right: logged-in user (name + plan badge +
sign-out) or a "sign in" button that opens the Google login modal.

### `#generate` — HERO: AI Post Generation (primary CTA area)
Two-column grid (`lg:grid-cols-2`, right column `lg:sticky lg:top-24`).
- **Left:** badge "توليد المنشورات بالذكاء الاصطناعي", H1 "ولّد منشورك الإعلاني مع حمزاوي",
  Arabic-only value prop: authentic Libyan copy compliant with Meta policies, with
  optional product image.
- **Left body (level 3+, logged in):** textarea for product details →
  dialect select (غربية / شرقية / جنوبية) → "ولّد النص" button → result box with
  copy button and compliance note. Level 4+ with `uploadedImageBase64` shows an
  "image-aware generation" hint.
- **Left body (level <3 or guest):** gated card — lock icon, message, and CTAs:
  guest → Google sign-in + "سجّل مجاناً"; paid-gated → WhatsApp subscribe + "عرض الخطط".
- **Right:** the **embedded functional Hamzawi assistant** (always-open inline chat,
  no floating bubble).

**Purpose:** make generation the first thing visitors experience; the assistant sits
beside the generator as the interactive entry point.

### `#image-gen` — AI Image Generation
Level-4+ gated `/api/image-gen` UI: product textarea, optional product-image input,
generate button, result preview with download + refresh. Non-level-4 users see a
gated card with a WhatsApp subscribe CTA to إدارة المحتوى.

**Purpose:** upsell the content-management tier; produce branded post designs.

### `#check` — Existing Post Check
Upload dropzone (image/video) + inline Arabic-only result card (status
`ممتاز` / `جيد` / `مرفوض`). Non-paid users get a Smart Fix WhatsApp upsell.

**Purpose:** the compliance-check value prop, converted into a retention/upgrade
funnel for Smart Fix.

### `#why` — Features
3-column feature grid communicating trust + differentiation.

### `#plans` — Pricing
3 paid plans (Smart Fix 400, إدارة المحتوى 800 highlighted, Agency 1000 LYD/mo).
Optional 50% discount banner (currently off). Each card: WhatsApp CTA with
pre-filled subscription message. Footer note: "نقبل الدفع بالتحويل المصرفي".

**Purpose:** monetize. This is the only conversion point for upgrades; all paid
CTAs across the page point here or to WhatsApp.

### Secondary: `#how`, trust badges, stats, `#agents`, `#faq`
Demoted styling: `text-xl font-bold` muted headings, smaller body text,
`opacity-90`. Agents list is a static list of WhatsApp-sales partners
(Libya, Jordan, Saudi Arabia). FAQ is the trust/objection-handling block.

**Purpose:** answer objections and show credibility **without** competing with the
primary CTA sections for attention.

## 3. CTA hierarchy (visual + functional weight)

1. **Primary:** Hero text generation ("ولّد النص") and embedded Hamzawi chat.
   Highest weight — fills the hero, primary color, appears first.
2. **Secondary:** WhatsApp subscribe buttons (image-gen gate, check upsell,
   pricing cards). Drive the revenue path: subscribe via WhatsApp.
3. **Tertiary:** Google sign-in (guest gates), "عرض الخطط" anchor links,
   header nav. Navigation / account actions, lowest emphasis.

Rules:
- Every gated feature resolves to a CTA: guest → sign-in / register;
  level <3 → Smart Fix WhatsApp; level <4 → إدارة المحتوى WhatsApp.
- All subscription CTAs go through WhatsApp (`wa.me`) with a pre-filled plan name —
  there is no in-app payment.
- Secondary sections never contain primary CTAs.

## 4. UX rules

- **Arabic-first.** `dir` = `dir` of translation (`rtl` default); key copy is
  Arabic; English strings exist only for the English toggle and are secondary.
- **Guest limitations visible before action:** guests see the 3-scan cap messaging
  and redacted results; gated cards explain exactly what the paid tier unlocks.
- **Results are inline** in the same section (check results, generated text,
  image generation) — no navigation away from the section on action.
- **Feedback during async work:** spinners/disabled states on generate/check
  buttons; toasts for success/error/session-expiry.
- **No floating elements on the page** (floating Hamzawi removed). Sticky elements
  only: header (`sticky top-0 z-50`) and the hero's embedded chat (`lg:sticky lg:top-24`).
- **Session expiry:** 401 on check/generate paths must log out and show an Arabic
  "session expired" toast (`handleAuthError` utility).
- **Cookie consent banner** (bottom, accept-only) must not overlap primary CTAs.
- **Modals:** trial-block modal (guest at 0 scans) offers a registration path;
  login modal hosts the Google button.

## 5. Verification contract

A homepage change is complete only when:
- Section order is exactly: generate → image-gen → check → why → plans → how →
  agents → faq.
- The floating Hamzawi widget is absent; the embedded chat renders in the hero.
- Guest view shows gated cards (no dead CTAs).
- `pnpm run typecheck` and `pnpm run build` pass.
- Homepage loads with zero console/page errors (headless Chromium check).
