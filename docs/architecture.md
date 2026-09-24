# PageClone — Architecture Notes (Phase 1)

This document records the structural decisions Phase 1 establishes so later phases can grow
the cloning engine without rewriting the extension.

## Module map

```
┌─────────────┐     props      ┌──────────────────────────┐
│ popup/main  │ ─────────────▶ │ popup/App (composition)  │
│  + hook     │                │  components · utils      │
└──────┬──────┘                └────────────┬─────────────┘
       │ uses                              │ reads types only
       ▼                                   ▼
┌──────────────────────────┐     ┌──────────────────────────┐
│ shared/chrome (tabs)     │     │ shared/types             │
│  detectActivePage()      │     │  PageDetection,          │
│  classifyTab() (pure)    │     │  AnalysisPhase,          │
└──────────────────────────┘     │  Capture*, Export*       │
                                 └──────────────────────────┘
┌─────────────┐   (Phase 2+)    ┌──────────────────────────┐
│ background  │ ◀────────────── │ future analysis/export   │
│  worker     │   messages      │ engine (not built yet)   │
└─────────────┘                 └──────────────────────────┘
┌─────────────┐   (Phase 2+)    ┌──────────────────────────┐
│ content     │ ◀────────────── │ DOM inspection           │
│  skeleton   │   not injected  │ (not active yet)         │
└─────────────┘                 └──────────────────────────┘
```

## Key decisions

### 1. Detection runs in the popup, not the background

`chrome.tabs.query` works directly from the popup. This keeps Phase 1 latency at zero (no
message round-trip) and keeps the service worker idle until a real pipeline needs it. The
worker already exists so Phase 2 adds listeners instead of new plumbing.

### 2. Pure core, thin Chrome binding

`classifyTab(tab)` implements all classification rules (restricted schemes, hostname
extraction, favicon safety) as a pure function. `detectActivePage()` only fetches the tab and
delegates. Tests cover both layers without mocking deeply.

### 3. One state machine, rendered by the UI

`AnalysisPhase` (`idle | detecting | detected | analyzing | ready | error`) plus
`ViewState` (`detecting | detected | unsupported | error`) cover every popup screen.
The popup receives states as props; it never decides _what_ the browser state is and never
contains analysis logic.

Crucially, **“page detected” ≠ “page analyzed”**: detection shows `Current page detected`,
analysis states (`analyzing`/`ready`) are a separate axis shown only when a future engine
drives `analysisPhase`.

### 4. Manifest as a validated source file

`extension/src/manifest/chrome.json` is the editable source. The build copies it to
`dist/manifest.json`, then `scripts/verify-dist.mjs` validates the built extension:

- required files exist (popup, worker, icons, hashed assets)
- `manifest_version === 3`
- permissions stay exactly `["tabs"]`
- no `host_permissions` / `content_scripts` until a later phase adds them on purpose

Unit tests additionally validate the source manifest, so a permission regression fails CI
even before the build step.

### 5. Least privilege, by construction

| Capability                        | Phase 1   | Later phase              |
| --------------------------------- | --------- | ------------------------ |
| Read active tab URL/title/favicon | ✅ `tabs` | —                        |
| Inject content script             | ❌        | Phase 2 (narrow matches) |
| Read page DOM                     | ❌        | Phase 2                  |
| Access cross-origin assets        | ❌        | Phase 3+                 |
| Host permissions                  | ❌        | Phase 3+                 |

Restricted pages (`chrome://`, `about:`, `file://`, store front-ends, devtools, websockets)
are classified as unsupported and shown with friendly copy. No bypass paths exist in code.

### 6. Future engine contracts are typed, not implemented

`shared/types` declares `PageTarget`, `PageMetadata`, `CaptureRequest`, `CaptureResult`,
`ExportJob`, `ExportResult`, and `AnalysisStatus`. These are interfaces only — Phase 2+
implements them behind the same names, so UI code written today keeps compiling.

## File ownership guide (for future phases)

| Change                               | Where                                                                 |
| ------------------------------------ | --------------------------------------------------------------------- |
| New popup screen / component         | `popup/components`, composed in `App.tsx`                             |
| New detection or classification rule | `shared/chrome` (+ tests)                                             |
| New restricted scheme                | `shared/constants` → `RESTRICTED_PROTOCOLS`                           |
| Analysis pipeline / messaging        | `background/`, driven via `AnalysisPhase`                             |
| DOM inspection                       | `content/` + manifest `content_scripts`                               |
| Export/architecture details          | `docs/`                                                               |
| New permission                       | `manifest/chrome.json` + `verify-dist.mjs` allowed set + README table |
