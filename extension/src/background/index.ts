/**
 * Service worker entry point (Manifest V3).
 *
 * Phase 2: mediates the capture pipeline — receives typed capture requests
 * from the popup, dispatches them to the tab's content script, validates the
 * result and returns it. Later phases extend this file with the export/ZIP
 * pipeline instead of restructuring the extension.
 */
import { CAPTURE_TIMEOUT_MS } from '@/shared/constants/capture';
import { isCaptureChannelMessage } from '@/shared/messaging/protocol';
import type { CaptureRequestMessage } from '@/shared/messaging/protocol';
import { handleCaptureRequest } from './captureService';
import type { CaptureServiceDeps } from './captureService';

chrome.runtime.onInstalled.addListener(() => {
  // First-run hook reserved for a later phase (no onboarding UI yet).
});

export const defaultCaptureDeps: CaptureServiceDeps = {
  async getTab(tabId) {
    return chrome.tabs.get(tabId);
  },
  async sendToTab(tabId, message) {
    return chrome.tabs.sendMessage(tabId, message);
  },
  timeoutMs: CAPTURE_TIMEOUT_MS,
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isCaptureChannelMessage(message)) return false;
  void handleCaptureRequest(message as CaptureRequestMessage, defaultCaptureDeps).then((response) =>
    sendResponse(response),
  );
  return true;
});
