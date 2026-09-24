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

/**
 * Resolves a raw attribute URL against the document base and returns an
 * absolute URL — but only for safe schemes (http, https, data:image/,
 * fragment). Relative URLs resolve against `baseHref`. Unsafe schemes
 * (javascript:, vbscript:, data:text/html, chrome:, …) return null.
 */
export function resolveSafeResourceUrl(rawUrl: string, baseHref: string): string | null {
  const trimmed = rawUrl.trim();
  if (trimmed === '') return null;
  if (trimmed.startsWith('#')) return trimmed;
  if (trimmed.toLowerCase().startsWith('data:image/')) return trimmed;

  const base = parseUrl(baseHref) ?? parseUrl('https://localhost/');
  if (base === null) return null;

  let resolved: URL;
  try {
    resolved = new URL(trimmed, base);
  } catch {
    return null;
  }

  if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
    return resolved.href;
  }
  if (resolved.protocol === 'mailto:' || resolved.protocol === 'tel:') {
    return resolved.href;
  }
  return null;
}

/** Extracts the first URL from a CSS `background-image`-style value. */
export function extractCssUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const match = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"']*))\s*\)/i.exec(value);
  if (!match) return null;
  const raw = match[1] ?? match[2] ?? match[3] ?? '';
  return raw.trim() === '' ? null : raw.trim();
}

/** Extracts the first candidate URL from a `srcset` attribute. */
export function extractFirstSrcsetUrl(srcset: string): string | null {
  const first = srcset.split(',')[0];
  if (first === undefined) return null;
  const url = first.trim().split(/\s+/)[0];
  return url === undefined || url === '' ? null : url;
}

/**
 * Page identity used for page-change protection: same document when
 * origin + path + query match (hash changes are same-document).
 */
export function pageIdentity(rawUrl: string): string | null {
  const url = parseUrl(rawUrl);
  if (!url) return null;
  return `${url.origin}${url.pathname}${url.search}`;
}
