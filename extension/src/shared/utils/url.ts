import { RESTRICTED_PROTOCOLS, WEBSTORE_HOSTNAMES } from '../constants';

/** Parses a URL, returning null instead of throwing on invalid input. */
export function parseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl.trim());
  } catch {
    return null;
  }
}

/**
 * True when a URL points at a browser-protected page or otherwise cannot be
 * worked with. Never attempts to bypass these restrictions.
 */
export function isRestrictedUrl(rawUrl: string): boolean {
  const url = parseUrl(rawUrl);
  if (!url) return true;
  if (RESTRICTED_PROTOCOLS.includes(url.protocol)) return true;
  return WEBSTORE_HOSTNAMES.includes(url.hostname.toLowerCase());
}

/** Extracts the hostname, or null when the URL is invalid/hostless. */
export function getHostname(rawUrl: string): string | null {
  const url = parseUrl(rawUrl);
  if (!url || url.hostname === '') return null;
  return url.hostname;
}

/** Human-friendly hostname for display ("www.example.com" → "example.com"). */
export function getDisplayHostname(hostname: string): string {
  return hostname.toLowerCase().startsWith('www.') ? hostname.slice(4) : hostname;
}

/**
 * Accepts only http(s) URLs and inline `data:image/` URLs as favicons, so an
 * attacker-controlled `javascript:` or `chrome:` value can never reach an
 * `<img src>`.
 */
export function isSafeFaviconUrl(rawUrl: string | undefined | null): boolean {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('data:image/')) return true;
  const url = parseUrl(trimmed);
  return url !== null && (url.protocol === 'https:' || url.protocol === 'http:');
}

/** Returns a safe favicon URL from tab metadata, or null when unavailable. */
export function resolveFaviconUrl(rawUrl: string | undefined | null): string | null {
  if (!isSafeFaviconUrl(rawUrl)) return null;
  return (rawUrl as string).trim();
}
