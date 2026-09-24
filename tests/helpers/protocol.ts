import { MESSAGE_CHANNELS } from '@/shared/constants';
import { createCaptureRequestId } from '@/shared/messaging/protocol';
import type { CaptureRequestMessage } from '@/shared/messaging/protocol';

export { createCaptureRequestId };

/** Builds a well-formed capture request for tests. */
export function createCaptureRequest(
  overrides: Partial<Omit<CaptureRequestMessage, 'channel' | 'type'>> = {},
): CaptureRequestMessage {
  return {
    channel: MESSAGE_CHANNELS.capture,
    type: 'capture-request',
    requestId: createCaptureRequestId(),
    tabId: 12,
    targetUrl: 'https://www.example.com/pricing',
    ...overrides,
  };
}
