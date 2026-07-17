import { deflate } from 'pako';
import type { GeneratedPreset } from './types';

export function downloadPreset(preset: GeneratedPreset): void {
  const jsonString = JSON.stringify(preset);
  const bytes = new TextEncoder().encode(jsonString);
  const compressed = deflate(bytes);

  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < compressed.length; i += chunk) {
    binary += String.fromCharCode(...compressed.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);

  const blob = new Blob([base64], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = preset.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  a.href = url;
  a.download = `${safeName || 'preset'}.prst`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
