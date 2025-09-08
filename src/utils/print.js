// src/utils/print.js

import * as QRCode from 'qrcode';

/**
 * Print HTML using a hidden iframe (popup-blocker friendly).
 */
export function printHTMLViaIframe(html) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  doc.open();
  doc.write(html);
  doc.close();

  iframe.onload = async () => {
    const w = iframe.contentWindow;
    try { await w.document.fonts?.ready; } catch {}
    const imgs = Array.from(w.document.images || []);
    await Promise.all(
      imgs.map((img) =>
        img.decode
          ? img.decode().catch(() => {})
          : img.complete
          ? Promise.resolve()
          : new Promise((res) => img.addEventListener('load', res, { once: true }))
      )
    );
    try { w.focus(); } catch {}
    try { w.print(); } catch {}
    setTimeout(() => document.body.removeChild(iframe), 800);
  };
}

/**
 * Load a bundled asset (e.g. imported logo) and return a data URL.
 */
export async function getLogoDataURL(logoUrl) {
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const rd = new FileReader();
      rd.onload = () => resolve(rd.result);
      rd.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

/**
 * Generate a QR PNG data URL from text.
 */
export function makeQR(text, opts = {}) {
  return QRCode.toDataURL(String(text ?? ''), { margin: 0, ...opts });
}
