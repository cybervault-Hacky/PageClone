# PageClone — Architecture Notes (Phase 2)

This document records the structural decisions Phases 1–2 establish so reconstruction
(Phase 3+) can grow behind stable interfaces without rewriting the extension.

## Module map

```
┌──────────────────────┐  capture request   ┌─────────────────────────────┐
│ popup                │ ─────────────────▶ │ background                  │
│  useCaptureAnalysis  │                    │  captureService             │
│  captureClient       │ ◀───────────────── │   · request guard           │
│  App · components    │  CaptureResult or  │   · tab/page identity (2×)  │
│  AnalysisSummary     │  structured error  │   · timeout (8 s)           │
└──────────────────────┘                    │   · result validation       │
                                            └──────────────┬──────────────┘
                                                           │ capture request
                                            ┌──────────────▼──────────────┐
                                            │ content (http/https only)   │
                                            │  index.ts endpoint          │
                                            │  engine/capture.ts          │
                                            │   engine/styles.ts          │
                                            │   engine/assets.ts          │
                                            │  shared/security/redact     │
                                            └─────────────────────────────┘

shared/  types · constants (whitelists/limits) · messaging (protocol)
         validation (CaptureResult schema) · chrome (detection) · utils (URL safety)
```

## Key decisions

### 1. Detection runs in the popup, analysis runs in the page

`chrome.tabs.query` still powers detection straight from the popup (zero-latency first
paint). Analysis itself must observe the live DOM, so Phase 2 injects a single
content script via **narrow `content_scripts` matches** (`http://*/*`, `https://*/*`,
store pages excluded, `document_idle`, `all_frames: false`). No `host_permissions`, no
programmatic `chrome.scripting` — registration is declarative and reviewable in the
manifest. The message flow is Popup → Background → Content → engine → Background
validation → Popup, so exactly one party (background) is trusted to validate.

### 2. The security boundary is a pipeline, not a convention

Raw DOM inspection output never becomes part of a result directly. Every node passes:

1. **Attribute allow-list** (`shared/constants/capture.ts`): `value`, `style`, `on*`,
   `data-*`, and unknown names are dropped (dropped attributes are counted);
   URL-ish attributes are scheme-checked (`http(s)/data:image` only) and made absolute.
2. **Text normalization**: whitespace collapsed, bounded per node and in total; form
   control tags (`textarea`, `option`… handled by tag policy) never emit text or values.
3. **SVG sanitization**: parsed via `DOMParser`, `script`/`foreignObject`/`iframe`…
   removed, `on*` attributes stripped, unsafe URLs cleared, re-serialized.
4. **Declared invariants**: `security.cookiesAccessed` / `storageAccessed` are literally
   `false`; unit tests install spies over `document.cookie`, `Storage`, `indexedDB` and
   assert **zero reads** during capture.

Mandatory regression tests (`tests/captureSecurity.test.ts`) prove
`<input type="password" value="SECRET">` and every form value are absent from the
serialized `CaptureResult` JSON.

### 3. Content is untrusted; background is the validator

`captureService.handleCaptureRequest` is dependency-injected (`getTab`, `sendToTab`,
`timeoutMs`) and treats the content script as hostile input:

- request guard + clamped `CaptureOptions` (`clampCaptureOptions`);
- pre-dispatch: tab exists, not restricted, `pageIdentity(tab.url)` matches;
- dispatch under an 8 s timeout (> engine's 6 s duration limit) → `CAPTURE_TIMEOUT`;
- response envelope must echo the `requestId`, code must be a known `CaptureErrorCode`;
- `validateCaptureResult` checks schema/version/limits/field shapes/parent-child
  integrity/JSON size → `CAPTURE_INVALID_RESULT | CAPTURE_LIMIT_REACHED |
CAPTURE_SERIALIZATION_FAILED`;
- post-dispatch: page identity checked **again** (SPA navigation during capture →
  `CAPTURE_PAGE_CHANGED`).

Failures become canonical human copy from `CAPTURE_ERROR_MESSAGES` — stack traces and
internal messages never leave the background.

### 4. CaptureResult is a normalized tree, not HTML

The engine emits `{ nodeId, parentId, childNodeIds, tagName, attributes, text?, styles?,
layout?, pseudo?, semantic, svg? }` nodes with sequential stable IDs, plus `assets`
(references only — images/backgrounds/SVG markup, never downloaded bytes), `links`
(absolute, never crawled), `statistics`, `warnings`, and `security`. It is
`version: 1`, pure JSON, and is what Phase 3 reconstructs — `documentElement.outerHTML`
is explicitly _not_ the capture format.

### 5. Defensive limits produce partial results, never crashes

`CAPTURE_LIMITS` (5 000 elements, 400 chars/node, 200 000 total chars, 500 assets,
depth 300, 6 000 ms, 5 MB serialized) are enforced _during_ the walk; hitting any cap
emits a typed warning (`element-limit`, `text-limit`, `asset-limit`, `duration-limit`,
`depth-limit`), sets `statistics.truncated`, and returns the best-effort tree. The
popup renders the "Analyzed with limitations" state for partial captures.

### 6. One state machine, honest copy

`AnalysisPhase` (`idle | detecting | detected | analyzing | ready | error`) plus
`ViewState` cover every popup screen. Copy contract (Phase 2): detection says
"Ready to analyze"; analysis says "Analyzing page…" → "Ready for reconstruction.";
errors show canonical engine copy with **"Try again"** / success offers **"Analyze
again"**. **"Detected" ≠ "analyzed" ≠ "cloned"** — the statistics grid only appears with
a validated real result.

### 7. Manifest as a validated source file

`extension/src/manifest/chrome.json` remains the editable source. `scripts/verify-dist.mjs`
validates the built extension: required files (now including `content.js`), MV3,
permissions **exactly** `["tabs"]`, and the exact content-script contract (matches,
excludes, `document_idle`, `all_frames: false`). Broader permissions or match patterns
fail the build — same for the source-manifest unit tests.

### 8. Least privilege, by construction

| Capability                       | Phase 1 | Phase 2                      |
| -------------------------------- | ------- | ---------------------------- |
| Read active tab URL/title        | ✅ tabs | ✅ tabs                      |
| Inject content script            | ❌      | ✅ narrow http/https matches |
| Read page DOM (read-only)        | ❌      | ✅ allow-listed inspection   |
| Read cookies/storage/form values | ❌      | ❌ (tested invariant)        |
| Host permissions                 | ❌      | ❌                           |
| Cross-origin asset downloads     | ❌      | ❌ (references only)         |

## File ownership guide

| Change                        | Where                                                       |
| ----------------------------- | ----------------------------------------------------------- |
| New popup screen / component  | `popup/components`, composed in `App.tsx`                   |
| New detection rule            | `shared/chrome` (+ tests)                                   |
| New restricted scheme         | `shared/constants` → `RESTRICTED_PROTOCOLS`                 |
| New style/attribute captured  | `shared/constants/capture.ts` whitelists (+ security tests) |
| Capture walk behaviour        | `content/engine/*`                                          |
| Validation / failure policy   | `shared/validation`, `background/captureService`            |
| Protocol / error copy         | `shared/messaging/protocol.ts`                              |
| Export/ZIP pipeline (Phase 4) | `background/` (extend `captureService`)                     |
| Reconstruction (Phase 3)      | new `shared/reconstruct` + popup export flow                |
| New permission                | `manifest/chrome.json` + `verify-dist.mjs` + README table   |
