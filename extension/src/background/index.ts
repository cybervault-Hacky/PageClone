/**
 * Service worker entry point (Manifest V3).
 *
 * Phase 1 keeps this worker intentionally small: tab detection runs directly
 * in the popup. The worker is the future home of cross-tab coordination, the
 * capture pipeline and ZIP export jobs — listeners are wired here so later
 * phases extend this file instead of restructuring the extension.
 */
chrome.runtime.onInstalled.addListener(() => {
  // First-run hook reserved for a later phase (no onboarding UI yet).
});
