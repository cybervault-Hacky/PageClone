# PageClone

**Capture the frontend of the current page — and rebuild it as a standalone local project.**

PageClone is a premium, local-first browser extension (Manifest V3). You open a page, click
PageClone, and the extension analyzes the real page you are looking at. Phase 3 added the
reconstruction engine: the analysis is now transformed into a deterministic, standalone
HTML+CSS document you can preview. Later phases will add asset downloading and ZIP export.

> **Status: Phase 3 (deterministic HTML + CSS reconstruction).** The extension performs a
> **real analysis of the current page** (Phase 2) and can now **reconstruct** that analysis
> into a standalone `<!doctype html>` document with fully generated, sanitized CSS —
> previewable in the popup. It does **not** yet download assets or export a ZIP (Phase 4,
> see [Roadmap](#roadmap)).

---

## Features (Phase 3)

**Capture & analysis (Phase 2)**

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
- **Local-first & least-privilege** — the only permission is `tabs`; the content script is
  declared with narrow `http/https` matches only. Nothing leaves your machine

**Reconstruction (Phase 3)**

- **Deterministic reconstruction engine** — `reconstructCapture(CaptureResult)` →
  `ReconstructionResult` (`html` + `css` + statistics + warnings). Same input → byte-identical
  output: no randomness, no timestamps, stable `pc-n<nodeId>` class identifiers
- **HTML rebuilt from the normalized tree** — the captured hierarchy is re-rendered (never
  copied), text is always escaped as data, forms are structural only (values are never
  reconstructed), unsupported elements are unwrapped with their safe children kept
- **CSS generated from captured computed styles** — no original stylesheet is copied; every
  declaration passes a value sanitizer that blocks declaration breakout, dangerous URL schemes
  and `</style>` breakouts; no-op defaults are skipped to keep output bounded
- **Pseudo-elements** — captured `::before`/`::after` data is emitted as sanitized rules
  (content can never become markup)
- **Inline SVG** — rebuilt from the sanitized capture-time markup and re-sanitized again at
  reconstruction (defense in depth)
- **Controlled preview** — after analysis, **Reconstruct Preview** renders the actual engine
  output in a sandboxed iframe (`srcdoc`, `sandbox=""`), with honest statistics and failure
  copy — never a fake page
- **Output validation & structure parity** — `validateReconstructionResult` re-checks every
  generated document against the policy before rendering; a parity module proves tag
  hierarchy, text, headings, links and interactive elements survive reconstruction

### What Phase 3 does _not_ do

It does **not** export a clone yet. No asset downloading (external images/fonts remain
external references), no JavaScript reconstruction, no event handlers, no ZIP, no crawling,
no backend/auth cloning — those arrive in later phases. The reconstruction is a static
frontend representation: structurally faithful, visually informed by captured styles, and
honest about its limitations via typed warnings.

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
│       │   ├── components/        # UI + AnalysisSummary + ReconstructPreview
│       │   ├── hooks/             # useActivePage, useCaptureAnalysis
│       │   ├── utils/             # view-state mapping + capture/reconstruction clients
│       │   ├── styles/            # design tokens + base + popup CSS
│       │   ├── App.tsx            # popup composition root
│       │   └── main.tsx           # React bootstrap (composes both hooks)
│       ├── shared/
│       │   ├── types/             # PageDetection, CaptureResult, ReconstructionResult
│       │   ├── constants/         # whitelists, limits, reconstruction policy
│       │   ├── reconstruct/       # Phase 3 engine (html/ css/ document/ validation/)
│       │   ├── messaging/         # typed protocol + clamps + error copy
│       │   ├── security/          # redaction/sanitization boundary
│       │   ├── validation/        # CaptureResult validation (background)
│       │   ├── chrome/            # tab detection (pure classify + binding)
│       │   └── utils/             # URL/favicon/page-identity safety helpers
│       └── manifest/
│           └── chrome.json        # source of truth for dist/manifest.json
├── scripts/                       # copy-manifest, verify-dist, generate-icons
├── tests/                         # 30 Vitest suites (326 tests)
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

### Reconstruction pipeline (Phase 3)

```
CaptureResult (validated)
  → reconstructCapture()            shared/reconstruct/reconstruct.ts
      1. re-validate input          reuses shared/validation/capture
      2. deterministic state        warnings · counters · class registry
      3. CSS renderer               css/  (values → properties → pseudo → rules)
      4. HTML renderer              html/ (tags → attributes → escape → tree)
      5. document assembler         document/assemble.ts
  ← ReconstructionResult { version, html, css, statistics, warnings }
  → validateReconstructionResult()  output re-checked before rendering
Popup: Reconstruct Preview → sandboxed <iframe srcdoc> (the real output)
```

### Boundaries that keep later phases simple

- **UI never talks to the engine directly.** The popup renders an `AnalysisPhase`
  (`idle → detecting → detected → analyzing → ready | error`); `useCaptureAnalysis` owns
  the transitions, components stay presentational. The preview consumes the pure engine —
  no Chrome APIs are involved in reconstruction.
- **Content is untrusted.** The background validates every response (schema, version,
  limits, serialization) before it reaches the popup; failure copy is canonical, never
  attacker- or stack-derived.
- **The reconstruction layer re-validates everything.** Input is re-checked with the
  Phase 2 validator, captured URLs are re-resolved through the Phase 2 URL utilities, and
  the generated document is re-checked by `validateReconstructionResult` before the popup
  will render it.
- **Detection stays pure.** `classifyTab()` remains a pure function; `PageMetadata` carries
  the `tabId` needed to address the tab.
- **Permissions are enforced at build time.** `verify-dist.mjs` fails the build if the
  manifest requests anything beyond `tabs`, or if `content_scripts` deviates from the exact
  narrow contract.

## Reconstruction notes (Phase 3)

- **Deterministic by construction.** No random IDs, no timestamps in output, canonical
  attribute/property ordering, stable `pc-n<nodeId>` classes. Running the engine twice on
  the same `CaptureResult` yields byte-identical HTML and CSS (regression-tested).
- **HTML ⇄ CSS synchronization.** A `pc-n<nodeId>` class is generated **iff** at least one
  rule references it; the engine never emits an unreferenced class or references a missing
  one. Original semantic classes are preserved next to the generated ones.
- **Security model.** Three re-checks sit between a capture and the screen: input
  re-validation, per-declaration CSS value sanitization (no `;{}`, no `<`, denylisted
  constructs, `url()` scheme checks, `content` restricted to safe strings), and output
  validation (raw-tag scan, attribute-universe scan, URL scheme scan, CSS structure).
  Scripts, handlers, form values, passwords and tokens can never be emitted — even from a
  hand-built malicious `CaptureResult` (regression-tested).
- **Honest limitations.** Unsupported elements are unwrapped (children kept), dangerous
  elements are dropped, head metadata is rebuilt minimally, viewport-derived html/body
  dimensions are never pinned, and every deviation is reported as a typed warning
  (`UNSUPPORTED_ELEMENT`, `UNSAFE_URL_OMITTED`, `STYLE_PROPERTY_OMITTED`, …) with counts.

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

30 suites / 326 tests cover: manifest rules, tab detection, every popup UI state,
accessibility, protocol guards and clamping, result validation, the background service
(failure paths, timeouts, page-change protection), the capture client and hook state
machine, DOM/style/layout/asset/link/interactive capture, performance limits and partial
results — plus mandatory **security regression suites** proving password and form values
never appear in `CaptureResult` JSON, and the Phase 3 suites covering HTML reconstruction,
CSS generation and value sanitization, document assembly, output validation, structure
parity, determinism and the preview integration (the iframe payload is asserted to be the
byte-exact engine output).

## Roadmap

| Phase | Scope                                                                                 |
| ----- | ------------------------------------------------------------------------------------- |
| **1** | ✅ Foundation: MV3 shell, tab detection, premium popup UI, CI                         |
| **2** | ✅ Real capture & analysis engine: DOM/styles/assets, security, limits                |
| **3** | ✅ Deterministic HTML + CSS reconstruction engine + controlled preview                |
| **4** | Asset extraction, downloading, local asset mapping, packaging preparation, ZIP export |
| **5** | Polish: settings, export history, optional light theme                                |

The reconstruction preview shows a real, deterministic document — but PageClone does **not**
claim pages are pixel-perfect yet, and external assets remain external references until the
Phase 4 asset pipeline exists.

## License

All rights reserved by the repository owner unless a license file states otherwise.
