export const CAST_URL_MESSAGE =
  'This video cannot currently be cast because the Chromecast needs a network-accessible media URL.';

export const CAST_UNAVAILABLE_MESSAGE = 'Google Cast is not available in this browser/device.';

/** True when a Chromecast on the same network could open this URL itself. */
export function isCastAccessibleUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/') || trimmed.startsWith('blob:') || trimmed.startsWith('file:') || trimmed.startsWith('data:')) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host.endsWith('.local')) {
    return false;
  }
  return true;
}

/**
 * Prefer an explicit test URL from settings. Otherwise the route URL must be public.
 * A relative, blob, or localhost file is never sent to the receiver.
 */
export function resolveCastUrl(
  routeUrl: string,
  castCompatible: boolean | undefined,
  testUrl: string,
): { url: string | null; reason: string | null } {
  const override = testUrl.trim();
  if (override) {
    return isCastAccessibleUrl(override) ? { url: override, reason: null } : { url: null, reason: CAST_URL_MESSAGE };
  }
  if (castCompatible === false || !isCastAccessibleUrl(routeUrl)) {
    return { url: null, reason: CAST_URL_MESSAGE };
  }
  return { url: routeUrl, reason: null };
}
