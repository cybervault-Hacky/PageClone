import { describe, expect, it } from 'vitest';
import '@/background/index';
import { chromeMock } from './chromeMock';

describe('background service worker', () => {
  it('wires exactly one onInstalled listener', () => {
    expect(chromeMock.listeners.onInstalled).toHaveLength(1);
  });

  it('handles every install reason without throwing', () => {
    const listener = chromeMock.listeners.onInstalled[0];
    expect(listener).toBeDefined();
    if (!listener) return;

    expect(() => listener({ reason: 'install', localInstall: true })).not.toThrow();
    expect(() => listener({ reason: 'update', previousVersion: '0.0.0' })).not.toThrow();
    expect(() => listener({ reason: 'chrome_update' })).not.toThrow();
  });
});
