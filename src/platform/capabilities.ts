export type BrowserCapabilities = {
  supportsWebBluetooth: boolean;
  supportsGoogleCast: boolean;
  supportsPWA: boolean;
  supportsIndexedDB: boolean;
};

export function detectCapabilities(): BrowserCapabilities {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      supportsWebBluetooth: false,
      supportsGoogleCast: false,
      supportsPWA: false,
      supportsIndexedDB: false,
    };
  }

  const bluetooth = (navigator as Navigator & { bluetooth?: unknown }).bluetooth;
  const ua = navigator.userAgent ?? '';
  const ios = /iPhone|iPad|iPod/i.test(ua);
  const chromium = /Chrome|Chromium|Edg\//.test(ua) && !ios;
  const castApi = window as Window & { cast?: { framework?: unknown }; chrome?: { cast?: unknown } };
  const castPresent = Boolean(castApi.cast?.framework || castApi.chrome?.cast);

  return {
    supportsWebBluetooth: bluetooth != null,
    supportsGoogleCast: castPresent || (chromium && window.isSecureContext),
    supportsPWA: 'serviceWorker' in navigator,
    supportsIndexedDB: typeof indexedDB !== 'undefined',
  };
}
