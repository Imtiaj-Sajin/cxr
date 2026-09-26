/** Trigger a browser download for text or binary content. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadText(text: string, filename: string, mime = 'text/plain'): void {
  // UTF-8 BOM helps older Windows players show Bangla correctly in .srt files.
  const bom = filename.endsWith('.srt') ? '﻿' : '';
  downloadBlob(new Blob([bom + text], { type: `${mime};charset=utf-8` }), filename);
}

/** `my video.final.mp4` -> `my video.final` */
export function baseName(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i > 0 ? filename.slice(0, i) : filename || 'subtitles';
}
