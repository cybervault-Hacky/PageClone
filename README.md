# PageClone

**Capture the frontend of the current page — and rebuild it as a standalone local project.**

PageClone is a premium, local-first browser extension (Manifest V3). You open a page, click
PageClone, and the extension analyzes the real page you are looking at. Later phases will
reconstruct that analysis into a standalone frontend project (`index.html` + assets) and
export it as a ZIP.

> **Status: Phase 2 (real current-page capture & analysis engine).** The extension now
> performs a **real analysis of the current page**: a content-script engine walks the DOM,
> collects safe structure/styles/assets/links into a normalized, versioned `CaptureResult`,
> and the popup shows honest statistics from that capture. It does **not** yet export a
> standalone clone — reconstruction and ZIP export arrive in Phases 3–4 (see
> [Roadmap](#roadmap)).

---

## Features (Phase 2)

- **Real current-page analysis** — content-script engine walks the live DOM and produces a
  versioned, JSON-serializable `CaptureResult` (structure, text, whitelisted computed styles,
  bounding-box layout, assets, links, page metadata)
- **Explicit security boundary** — DOM → raw inspection → sanitization/redaction → normalized
  result. Form values, passwords, `on*` handlers, cookies, storage and tokens **never** enter
  the result (mandatory regression-tested)
- **Typed message flow** — Popup → Background → Content engine → Background validation →
  Popup, with request IDs and structured error codes (no stack traces ever reach the UI)
- **Defensive limits** — element/text/asset/time caps return valid _partial_ results with
  warnings and statistics instead of crashing
- **Page-change protection** — identity is checked before _and_ after capture; navigation
  during analysis surfaces a clear retryable error
- **Premium dark popup UI** — same design system as Phase 1, now with analysis states
  (`detected → analyzing → ready | error`), a real statistics grid, an honest
  "Analyzed with limitations" partial state, and human-readable errors with retry
- **Local-first & least-privilege** — the only permission is `tabs`; the content script is
  declared with narrow `http/https` matches only. Nothing leaves your machine
- **Production toolchain** — TypeScript (strict), React 19, Vite 8, ESLint, Prettier,
  Vitest, CI

### What Phase 2 does _not_ do

It does **not** export a clone. No HTML/CSS reconstruction, no asset downloading, no ZIP, no
crawling, no backend/auth cloning. The capture engine is the analysis foundation those later
phases build on.

## Technology stack

| Layer      | Choice                                       |
| ---------- | -------------------------------------------- |
| Manifest   | Chrome Manifest V3                           |
| Language   | TypeScript (strict)                          |
| UI         | React 19                                     |
| Build      | Vite 8 (popup + service worker + content js) |
| Lint/Style | ESLint 9 (flat config) + Prettier            |
| Tests      | Vitest + Testing Library (jsdom)             |
| CI         | GitHub Actions                               |

## Getting started

Requires **Node.js ≥ 20**.

```bash
npm install
npm run dev        # popup dev server with HMR (runs the REAL engine on the preview page)
npm run build      # production build → dist/ (validated automatically)
npm test           # unit tests
npm run typecheck  # tsc --noEmit
npm run lint       # eslint --max-warnings=0
npm run format     # prettier --write
```

### Load the extension in Chrome

1. `npm run build`
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select the `dist/` folder
5. Open any regular `http(s)` website and click the PageClone toolbar icon
6. Press **Analyze Page** — statistics come from a real capture of that page

## Scripts

| Script                    | Purpose                                            |
| ------------------------- | -------------------------------------------------- |
| `npm run dev`             | Popup dev server (HMR; real engine, mock tab)      |
| `npm run watch`           | Rebuild `dist/` on change                          |
| `npm run build`           | Production build + manifest copy + dist validation |
| `npm run typecheck`       | Strict TypeScript check                            |
| `npm run lint`            | ESLint (zero warnings allowed)                     |
| `npm run format`          | Prettier write                                     |
| `npm test` / `test:watch` | Run / watch unit tests                             |
| `npm run icons`           | Regenerate extension PNG icons (no image deps)     |

## Project architecture

```
PageClone/
├── extension/
│   ├── popup.html                 # popup HTML entry (Vite input)
│   └── src/
│       ├── background/
│       │   ├── index.ts           # capture message listener (DI-wired)
│       │   └── captureService.ts  # page-identity, timeout, result validation
│       ├── content/
│       │   ├── index.ts           # capture endpoint (typed request → response)
│       │   └── engine/
│       │       ├── capture.ts     # DOM walk orchestrator → CaptureResult
│       │       ├── styles.ts      # whitelisted computed-style reading
│       │       └── assets.ts      # image/background/SVG discovery (refs only)
│       ├── popup/
│       │   ├── components/        # UI + AnalysisSummary (stats grid)
│       │   ├── hooks/             # useActivePage, useCaptureAnalysis
│       │   ├── utils/             # view-state mapping + captureClient
│       │   ├── styles/            # design tokens + base + popup CSS
│       │   ├── App.tsx            # popup composition root
│       │   └── main.tsx           # React bootstrap (composes both hooks)
│       ├── shared/
│       │   ├── types/             # PageDetection, CaptureResult model, phases
│       │   ├── constants/         # whitelists, limits, channels
│       │   ├── messaging/         # typed protocol + clamps + error copy
│       │   ├── security/          # redaction/sanitization boundary
│       │   ├── validation/        # CaptureResult validation (background)
│       │   ├── chrome/            # tab detection (pure classify + binding)
│       │   └── utils/             # URL/favicon/page-identity safety helpers
│       └── manifest/
│           └── chrome.json        # source of truth for dist/manifest.json
├── scripts/                       # copy-manifest, verify-dist, generate-icons
├── tests/                         # 21 Vitest suites (233 tests)
├── docs/                          # architecture notes
└── .github/workflows/ci.yml       # typecheck → lint → format → test → build
```

### Analysis pipeline

```
Popup (useCaptureAnalysis)
  → chrome.runtime.sendMessage  { channel: 'pageclone:capture', requestId, tabId, targetUrl, options }
    → Background (captureService): validate request · tab/page identity · timeout ≤ 8 s
      → Content (engine): DOM → raw inspection → sanitization → normalized CaptureResult
      ← CaptureResult | structured failure code
    ← schema/version/limit validation · page identity re-check
  ← CaptureOutcome { ok, result | code, message }
Popup: idle → analyzing → ready (stats grid) | error (canonical copy + retry)
```

### Boundaries that keep later phases simple

- **UI never talks to the engine directly.** The popup renders an `AnalysisPhase`
  (`idle → detecting → detected → analyzing → ready | error`); `useCaptureAnalysis` owns
  the transitions, components stay presentational.
- **Content is untrusted.** The background validates every response (schema, version,
  limits, serialization) before it reaches the popup; failure copy is canonical, never
  attacker- or stack-derived.
- **Detection stays pure.** `classifyTab()` remains a pure function; `PageMetadata` carries
  the `tabId` needed to address the tab.
- **Permissions are enforced at build time.** `verify-dist.mjs` fails the build if the
  manifest requests anything beyond `tabs`, or if `content_scripts` deviates from the exact
  narrow contract.

## Permissions & privacy

| Permission / declaration  | Why Phase 2 needs it                                    |
| ------------------------- | ------------------------------------------------------- |
| `tabs`                    | Read active-tab URL/title/favicon; address the tab      |
| `content_scripts` matches | `http://*/*` + `https://*/*` only, store pages excluded |

- **No host permissions** — injection is declared solely through the narrow content-script
  matches; nothing runs on `chrome://`, `file:`, `about:`, or store pages.
- The content script is a **read-only analyzer**: it never modifies the page, never follows
  links, and never reads cookies, `localStorage`, `sessionStorage`, IndexedDB, form values,
  passwords or tokens. Attribute capture is allow-list based (`value`, `style`, `on*` are
  excluded); inline SVG is sanitized (no scripts, no external references).
- No data is transmitted anywhere — everything is processed locally between extension
  contexts. Browser-protected pages are refused with a clear message; PageClone does not
  bypass browser security.

## Testing

```bash
npm test
```

21 suites / 233 tests cover: manifest rules, tab detection, every popup UI state,
accessibility, protocol guards and clamping, result validation, the background service
(failure paths, timeouts, page-change protection), the capture client and hook state
machine, DOM/style/layout/asset/link/interactive capture, performance limits and partial
results — plus a mandatory **security regression suite** proving password and form values
never appear in `CaptureResult` JSON.

## Roadmap

| Phase | Scope                                                                  |
| ----- | ---------------------------------------------------------------------- |
| **1** | ✅ Foundation: MV3 shell, tab detection, premium popup UI, CI          |
| **2** | ✅ Real capture & analysis engine: DOM/styles/assets, security, limits |
| **3** | Reconstruction into a standalone project (`index.html` + assets)       |
| **4** | ZIP export of the cloned frontend project                              |
| **5** | Polish: settings, export history, optional light theme                 |

Reconstruction is **planned, not yet available**. PageClone will never claim a page was
cloned until the engine actually did it — the UI says _analyzed_ until then.

## License

All rights reserved by the repository owner unless a license file states otherwise.
