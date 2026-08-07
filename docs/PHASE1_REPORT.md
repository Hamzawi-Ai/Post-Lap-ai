# Phase 1 Report — Hide Hamzawi Branding (Presentation Layer)

Date: 2026-08-08
Scope: **Presentation layer only.** No database, API, service, or internal
class names were changed. All `/api/hamzawi/*` endpoints, `hamzawi_*` DB columns,
service names, and internal identifiers (`from: "hamzawi"`, `addHamzawi`,
`HamzawiChat` component) are untouched.

## Changes applied

All user-visible Hamzawi branding was replaced with **PostLab**.

### Components

| File | Change |
| --- | --- |
| `src/components/HamzawiChat.tsx` | i18n: title `حمزاوي`→`PostLab`, `Hamzawi`→`PostLab`; welcome messages; thinking/loading text; avatar letter `ح`→`P` (header + bubbles + toggle); toggle tooltip `تحدث مع حمزاوي`→`تحدث مع PostLab`; download filename `hamzawi-post-`→`postlab-post-` |
| `src/components/HamzawiSidebar.tsx` | sidebar title `حمزاوي`→`PostLab`; avatar letter `ح`→`P` |
| `src/components/BrandSetupForm.tsx` | placeholder `مخبز حمزاوي`→`مخبز الأصيل`; CTA `حفظ والبدء مع حمزاوي`→`حفظ والبدء مع PostLab` |

### Pages

| File | Change |
| --- | --- |
| `src/pages/home.tsx` | FAQ answer; plan feature list; nav label `حمزاوي`/`Hamzawi`→`المساعد`/`Assistant`; check-tool description; 2 feature cards; "how it works" step 1; trial-block modal; subscribe modal (feature list + description); login modal |
| `src/pages/hamzawi.tsx` | header badge `حمزاوي — مساعدك التسويقي`→`PostLab — مساعدك التسويقي` |
| `src/pages/brand.tsx` | 3 strings: profile description, completion status, empty-state CTA |
| `src/pages/onboarding.tsx` | onboarding description |
| `src/pages/privacy.tsx` | data-collection list item |
| `src/pages/terms.tsx` | services description |

## Untouched (by design)

- All `/api/hamzawi/*` fetch calls and API paths.
- Internal identifiers: `addHamzawi`, `chatBlock("hamzawi")`, `from: "hamzawi"`,
  `SESSION_OPENED_KEY = "hamzawi_opened"`, component names `HamzawiChat`,
  `HamzawiSidebar`, `HamzawiWorkspace`, file names `hamzawi.tsx`.
- Route paths (`/hamzawi`, `/khtfa-secure-portal`, etc.), URLs, API endpoints,
  and auth.
- DB schema, backend services, deployment/Replit/build config, file names.
- **No redirects added, no files moved, no components refactored, no functional
  changes** — the only edits are user-visible text and the chat avatar letter.
- Code comments referencing "Hamzawi" (e.g. `lib/messages/parser.ts:21`) — internal
  documentation only, not user-facing.

## Verification

- `pnpm typecheck` — passed
- `pnpm build` — passed
