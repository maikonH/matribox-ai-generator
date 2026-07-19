const PRO_HEADER = [3, 2, 0, 0, 16, 11, 0, 128, 0, 5, 1, 4, 3, 12, 1, 5, 1, 15, 105, 2, 105, 164, 2, 0, 2, 1];

export function downloadPresetPro(name: string, ampFxId: number, cabFxId: number, params: number[]) {
  const dynamicMatrix = [ampFxId, cabFxId, ...params];
  const fullArray = [...PRO_HEADER, ...dynamicMatrix];
  const base64Data = btoa(JSON.stringify(fullArray));

  const blob = new Blob([base64Data], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${name.replace(/\s+/g, '_')}.prst`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
