# PageClone — Architecture Notes (Phases 1–3)

This document records the structural decisions Phases 1–3 establish so asset handling,
behavior cloning and export (Phase 4+) can grow behind stable interfaces without rewriting
the extension.

## Module map

```
┌──────────────────────┐  capture request   ┌─────────────────────────────┐
│ popup                │ ─────────────────▶ │ background                  │
│  useCaptureAnalysis  │                    │  captureService             │
│  captureClient       │ ◀───────────────── │   · request guard           │
│  App · components    │  CaptureResult or  │   · tab/page identity (2×)  │
│  AnalysisSummary     │  structured error  │   · timeout (8 s)           │
│  ReconstructPreview  │                    │   · result validation       │
└─────────┬────────────┘                    └──────────────┬──────────────┘
          │ reconstructCapture (pure, in-process)          │ capture request
┌─────────▼───────────────────────────────┐   ┌────────────▼────────────────┐
│ shared/reconstruct (Phase 3)            │   │ content (http/https only)   │
│  reconstruct.ts     orchestrator        │   │  index.ts endpoint          │
│  html/  escape·tags·attributes·render   │   │  engine/capture.ts          │
│  css/   values·properties·pseudo·render │   │   engine/styles.ts          │
│  document/assemble.ts                   │   │   engine/assets.ts          │
│  validation/ validate·parity            │   │  shared/security/redact     │
└─────────────────────────────────────────┘   └─────────────────────────────┘

shared/  types · constants (whitelists/limits/policy) · messaging (protocol)
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

| Capability                       | Phase 1 | Phase 2                      | Phase 3                  |
| -------------------------------- | ------- | ---------------------------- | ------------------------ |
| Read active tab URL/title        | ✅ tabs | ✅ tabs                      | ✅ tabs                  |
| Inject content script            | ❌      | ✅ narrow http/https matches | ✅ unchanged             |
| Read page DOM (read-only)        | ❌      | ✅ allow-listed inspection   | ✅ unchanged             |
| Read cookies/storage/form values | ❌      | ❌ (tested invariant)        | ❌ (tested invariant)    |
| Host permissions                 | ❌      | ❌                           | ❌                       |
| Cross-origin asset downloads     | ❌      | ❌ (references only)         | ❌ (references only)     |
| Execute reconstructed output     | —       | —                            | ❌ sandboxed iframe only |

## Phase 3 — the reconstruction engine

### 9. One pure function, five small stages

`reconstructCapture(capture, options?)` (`shared/reconstruct/reconstruct.ts`) is the only
entry point. It is pure — no Chrome APIs, no clocks, no randomness — and composes five
stages:

1. **Input re-validation.** The Phase 2 `validateCaptureResult` is reused verbatim; invalid
   input throws `ReconstructionInputError` instead of producing a partial guess.
2. **Deterministic state** (`state.ts`): counters, a deduplicated warning map and the
   generated-class registry that enforces the HTML ⇄ CSS synchronization invariant.
3. **CSS renderer** (`css/`): per-node rules from the captured computed styles, in canonical
   whitelist order; pseudo rules from the captured `::before`/`::after` subset; no-op
   ("initial value") skipping keeps output bounded; html/body viewport-derived dimensions are
   never pinned so the document sizes itself like the original page.
4. **HTML renderer** (`html/`): walks the captured tree — never source HTML — through the
   tag policy (`allowed` / `dangerous` → dropped / `unsupported` → unwrapped with safe
   children kept), the per-tag attribute policy, full text escaping and whitespace-safe
   block-level line breaking (newlines only ever appear between block-level boxes, never
   around inline content or inside `<pre>`).
5. **Document assembler** (`document/assemble.ts`): `<!doctype html>` + rebuilt head
   (charset, viewport, title, optional favicon link, `<style>`) + reconstructed body. Head
   metadata is rebuilt from validated page metadata — captured head tags are never copied.

`ReconstructionResult` is `{ version, html, css, statistics, warnings }` — pure JSON, no DOM
references, no functions, no timestamps.

### 10. CSS is generated, never copied

Every declaration is re-serialized through `css/values.ts`, which guarantees a captured
value can never break out of a declaration, inject a rule, or smuggle an executable URL:

- forbidden characters: `{ } ; < > \` backslash, control characters;
- denylisted constructs (`expression(`, `javascript:`, `vbscript:`, `-moz-binding`,
  `behavior:`, `@import`, `@charset`);
- every `url(…)` layer re-resolved through the Phase 2 URL utility and re-quoted — only
  http(s)/data:image/fragment schemes survive; unsafe layers drop the whole declaration;
- `content` accepts exactly one double-quoted CSS string without raw angle brackets — a
  pseudo-element can never close the `<style>` element or inject markup.

### 11. Three re-checks between a capture and the screen

Phase 2 already guarantees what enters a `CaptureResult`. Phase 3 never trusts that alone:

1. **Input**: `validateCaptureResult` again (schema, limits, tree integrity).
2. **Generation**: attribute policy (per-tag allow-list, `value`/`style`/`on*`/`data-*`
   impossible by construction), CSS value sanitizer (above), SVG re-sanitization via the
   Phase 2 `sanitizeSvgMarkup` plus a structural string gate for non-DOM environments.
3. **Output**: `validateReconstructionResult` re-parses the generated document and rejects
   it unless every attribute name is inside the policy universe, no raw executable tag
   exists, no attribute value carries an executable scheme, the CSS is structurally sound,
   and statistics match the payloads (byte counts, warning counts). Text and attributes are
   fully escaped, so raw `<`, `>` and `"` in the output can only originate from the renderer
   itself — the scans are exact, never fooled by text content.

The popup preview additionally renders inside `<iframe sandbox srcdoc=…>`: no scripts, no
same-origin access, no navigation.

### 12. Determinism rules

- generated identifiers are `pc-n<nodeId>` — derived from stable capture node ids;
- attributes emit in a canonical order; CSS declarations in whitelist order; rules in node
  order; warnings dedupe by code with deterministic counts;
- iteration never relies on object key order (whitelist-driven) — regression-tested by
  re-running reconstruction on key-reordered captures;
- no clock or random source is read during reconstruction; byte counts use UTF-8 encoding;
- running the engine twice yields byte-identical output (tested across all fixtures).

### 13. Honest deviations → typed warnings

Every structural deviation is counted and surfaced:
`UNSUPPORTED_ELEMENT`, `UNSAFE_ELEMENT_REMOVED`, `UNSAFE_ATTRIBUTE_OMITTED`,
`UNSAFE_URL_OMITTED`, `STYLE_PROPERTY_OMITTED`, `PSEUDO_ELEMENT_UNAVAILABLE`,
`EXTERNAL_ASSET_REFERENCE`, `FORM_VALUE_OMITTED`, `SVG_MARKUP_UNAVAILABLE`,
`HEAD_METADATA_SIMPLIFIED`.

Known Phase 3 limitations (deliberate, documented scope): external assets remain external
references (no downloading/base64 until Phase 4); no JavaScript reconstruction; captured
text is whitespace-collapsed per the capture model, so text nodes reproduce the captured
(normalized) form; responsiveness/media queries and animation playback are later phases;
computed-style flattening means per-element fixed values (no cascade reconstruction). The
popup label remains "Reconstruct Preview" — PageClone never claims a page was cloned.

## File ownership guide

| Change                           | Where                                                        |
| -------------------------------- | ------------------------------------------------------------ |
| New popup screen / component     | `popup/components`, composed in `App.tsx`                    |
| New detection rule               | `shared/chrome` (+ tests)                                    |
| New restricted scheme            | `shared/constants` → `RESTRICTED_PROTOCOLS`                  |
| New style/attribute captured     | `shared/constants/capture.ts` whitelists (+ security tests)  |
| Capture walk behaviour           | `content/engine/*`                                           |
| Validation / failure policy      | `shared/validation`, `background/captureService`             |
| Protocol / error copy            | `shared/messaging/protocol.ts`                               |
| Reconstruction policy (tags/CSS) | `shared/constants/reconstruct.ts` (+ reconstruction tests)   |
| Reconstruction renderer changes  | `shared/reconstruct/*` (+ parity/determinism/security tests) |
| Export/ZIP pipeline (Phase 4)    | `background/` (extend `captureService`)                      |
| New permission                   | `manifest/chrome.json` + `verify-dist.mjs` + README table    |
