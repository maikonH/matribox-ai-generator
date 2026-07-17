const KEY = 'matribox_gemini_api_key';

export function loadApiKey(): string {
  return localStorage.getItem(KEY) ?? '';
}

export function saveApiKey(key: string): void {
  localStorage.setItem(KEY, key);
}

/**
 * The effective key used at runtime: the user-provided key wins, falling back
 * to the build-time env var so the app works out-of-the-box after a reimport.
 */
export function getEffectiveApiKey(): string {
  return loadApiKey() || import.meta.env.VITE_GEMINI_API_KEY || '';
}

export function hasEnvApiKey(): boolean {
  return Boolean(import.meta.env.VITE_GEMINI_API_KEY);
}
