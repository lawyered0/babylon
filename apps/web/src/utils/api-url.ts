/**
 * API URL Resolution Utility
 *
 * Resolves relative API paths to absolute URLs when NEXT_PUBLIC_API_URL is set.
 * This enables the same client code to work in both contexts:
 *
 * - **Web (same-origin):** NEXT_PUBLIC_API_URL is unset → returns path as-is (e.g., '/api/posts')
 * - **Mobile (cross-origin):** NEXT_PUBLIC_API_URL is set → returns full URL (e.g., 'https://play.babylon.market/api/posts')
 *
 * The env var is baked into the bundle at build time by Next.js (NEXT_PUBLIC_ prefix).
 */

const API_BASE_URL: string =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '') // strip trailing slashes
    : '';

/**
 * Prepend the API base URL to a relative path.
 *
 * @param path - A relative API path (e.g., '/api/posts') or an already-absolute URL
 * @returns The resolved URL. Returns the path unchanged when no base URL is configured.
 *
 * @example
 * ```ts
 * // Web (NEXT_PUBLIC_API_URL unset):
 * apiUrl('/api/posts') // → '/api/posts'
 *
 * // Mobile (NEXT_PUBLIC_API_URL = 'https://play.babylon.market'):
 * apiUrl('/api/posts') // → 'https://play.babylon.market/api/posts'
 *
 * // Already absolute:
 * apiUrl('https://example.com/foo') // → 'https://example.com/foo'
 * ```
 */
export function apiUrl(path: string): string {
  if (!API_BASE_URL) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE_URL}${path}`;
}
