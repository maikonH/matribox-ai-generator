const KEY = 'matribox_gemini_api_key';

export function loadApiKey(): string {
  return localStorage.getItem(KEY) ?? '';
}

export function saveApiKey(key: string): void {
  localStorage.setItem(KEY, key);
}
