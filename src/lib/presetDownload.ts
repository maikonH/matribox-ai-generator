import { deflate } from 'pako';
import type { GeneratedPreset } from './types';

export function downloadPreset(preset: GeneratedPreset): void {
  const jsonString = JSON.stringify(preset, null, 2);
  const bytes = new TextEncoder().encode(jsonString);
  const compressed = deflate(bytes);

  const blob = new Blob([compressed], { type: 'application/octet-stream' });
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
