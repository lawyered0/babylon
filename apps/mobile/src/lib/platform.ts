/**
 * Platform detection utilities for the Capacitor mobile app.
 *
 * Provides runtime detection of whether the app is running in a native
 * Capacitor WebView (iOS/Android) or in a regular browser.
 */

let _isNative: boolean | null = null;
let _platform: string | null = null;

function detect() {
  if (typeof window === 'undefined') {
    _isNative = false;
    _platform = 'ssr';
    return;
  }

  // Check for Capacitor global (injected by native shell)
  // biome-ignore lint/suspicious/noExplicitAny: Capacitor global check
  const cap = (window as any)?.Capacitor;
  if (cap?.isNativePlatform?.()) {
    _isNative = true;
    _platform = cap.getPlatform?.() ?? 'native';
    return;
  }

  // Fallback: check origin scheme
  const origin = window.location.origin;
  if (origin.startsWith('capacitor://')) {
    _isNative = true;
    _platform = 'ios';
  } else if (
    origin === 'https://localhost' &&
    navigator.userAgent.includes('Android')
  ) {
    _isNative = true;
    _platform = 'android';
  } else {
    _isNative = false;
    _platform = 'web';
  }
}

/** Whether the app is running inside a native Capacitor shell. */
export function isNativePlatform(): boolean {
  if (_isNative === null) detect();
  return _isNative!;
}

/** Returns 'ios', 'android', 'web', or 'ssr'. */
export function getPlatform(): string {
  if (_platform === null) detect();
  return _platform!;
}

/** Whether the app is running on iOS (Capacitor). */
export function isIOS(): boolean {
  return getPlatform() === 'ios';
}

/** Whether the app is running on Android (Capacitor). */
export function isAndroid(): boolean {
  return getPlatform() === 'android';
}

