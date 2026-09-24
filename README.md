# PageClone

**Capture the frontend of the current page — and rebuild it as a standalone local project.**

PageClone is a premium, local-first browser extension (Manifest V3). You open a page, click
PageClone, and the extension detects the active tab. Later phases will analyze the page and
export a complete, standalone frontend project (`index.html` + assets) as a ZIP.

> **Status: Phase 1 (foundation).** This release ships the production extension shell:
> Manifest V3 wiring, current-tab detection, and the full popup UI/state architecture.
> The actual page-cloning / reconstruction engine is **not implemented yet** — it is
> planned for later phases (see [Roadmap](#roadmap)).

---

## Features (Phase 1)

- **Current-page detection** — safe tab metadata (URL, hostname, title, favicon) on popup open
- **Premium dark popup UI** — compact, minimal, Apple-inspired design system
- **Full state architecture** — detecting / detected / unsupported / analyzing / ready / error
- **Honest unsupported handling** — `chrome://`, `about:`, store pages and other browser-internal
  pages are classified and explained, never probed or bypassed
- **Local-first & least-privilege** — the only permission is `tabs`; nothing leaves your machine
- **Production toolchain** — TypeScript, React 19, Vite 8, ESLint, Prettier, Vitest, CI

## Technology stack

| Layer      | Choice                                       |
| ---------- | -------------------------------------------- |
| Manifest   | Chrome Manifest V3                           |
| Language   | TypeScript (strict)                          |
| UI         | React 19                                     |
| Build      | Vite 8 (multi-entry: popup + service worker) |
| Lint/Style | ESLint 9 (flat config) + Prettier            |
| Tests      | Vitest + Testing Library (jsdom)             |
| CI         | GitHub Actions                               |

## Getting started

Requires **Node.js ≥ 20**.

```bash
npm install
npm run dev        # popup dev server with a mock active tab (HMR)
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
5. Open any regular website and click the PageClone toolbar icon

## Scripts

| Script                    | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `npm run dev`             | Popup dev server (HMR, mock tab outside the browser) |
| `npm run watch`           | Rebuild `dist/` on change                            |
| `npm run build`           | Production build + manifest copy + dist validation   |
| `npm run typecheck`       | Strict TypeScript check                              |
| `npm run lint`            | ESLint (zero warnings allowed)                       |
| `npm run format`          | Prettier write                                       |
| `npm test` / `test:watch` | Run / watch unit tests                               |
| `npm run icons`           | Regenerate extension PNG icons (no image deps)       |

## Project architecture

```
PageClone/
├── extension/
│   ├── popup.html                 # popup HTML entry (Vite input)
│   └── src/
│       ├── background/            # MV3 service worker (future capture/export pipeline)
│       ├── content/               # content-script skeleton (not injected in Phase 1)
│       ├── popup/
│       │   ├── components/        # presentational UI components
│       │   ├── hooks/             # useActivePage (detection binding)
│       │   ├── types/             # UI-level view models (ViewState, tones)
│       │   ├── utils/             # view-state mapping + helpers
│       │   ├── styles/            # design tokens + base + popup CSS
│       │   ├── App.tsx            # popup composition root
│       │   └── main.tsx           # React bootstrap
│       ├── shared/
│       │   ├── types/             # PageTarget, PageMetadata, CaptureRequest/Result,
│       │   │                      # ExportJob/Result, AnalysisPhase/Status …
│       │   ├── constants/         # restricted protocols, message channels
│       │   ├── chrome/            # tab detection (pure classify + Chrome binding)
│       │   └── utils/             # URL/favicon safety helpers
│       └── manifest/
│           └── chrome.json        # source of truth for dist/manifest.json
├── scripts/                       # copy-manifest, verify-dist, generate-icons
├── tests/                         # Vitest suites (mirrored by feature)
├── docs/                          # architecture notes
└── .github/workflows/ci.yml       # typecheck → lint → format → test → build
```

### Boundaries that keep future phases simple

- **UI never talks to the analysis engine.** The popup renders an `AnalysisPhase`
  (`idle → detecting → detected → analyzing → ready | error`); a later phase drives that state
  without touching component internals.
- **Detection is pure at the core.** `classifyTab()` is a pure function; only
  `detectActivePage()` binds to `chrome.tabs` — both are unit-tested.
- **Engine contracts are already typed.** `CaptureRequest`, `CaptureResult`, `ExportJob` and
  `ExportResult` exist in `shared/types` so the ZIP pipeline can land behind stable interfaces.
- **Permissions grow deliberately.** `verify-dist.mjs` fails the build if Phase 1's manifest
  ever requests more than `tabs`, or gains host permissions / content scripts prematurely.

## Permissions & privacy

| Permission | Why Phase 1 needs it                                     |
| ---------- | -------------------------------------------------------- |
| `tabs`     | Read the active tab's URL, title and favicon for display |

- **No host permissions, no content scripts** are requested yet — PageClone injects nothing
  into any page during Phase 1.
- No data is transmitted anywhere. No cookies, credentials or tokens are ever read.
- Browser-protected pages (`chrome://`, `about:`, the Web Store, …) are refused with a clear
  message — PageClone does not bypass browser security.

## Testing

```bash
npm test
```

Coverage includes: manifest rules, dist build validation (inside `npm run build`), tab
detection (supported / restricted / missing / API failure), every popup UI state,
accessibility expectations (landmarks, labels, live region), favicon safety, and shared
utilities.

## Roadmap

| Phase | Scope                                                            |
| ----- | ---------------------------------------------------------------- |
| **1** | ✅ Foundation: MV3 shell, tab detection, premium popup UI, CI    |
| **2** | Page analysis engine (DOM inspection, asset discovery)           |
| **3** | Reconstruction into a standalone project (`index.html` + assets) |
| **4** | ZIP export of the cloned frontend project                        |
| **5** | Polish: settings, export history, optional light theme           |

Deep webpage reconstruction is **planned, not yet available**. PageClone will never claim a
page was cloned until the engine actually did it.

## License

All rights reserved by the repository owner unless a license file states otherwise.
