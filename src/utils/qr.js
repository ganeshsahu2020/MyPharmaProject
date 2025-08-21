// src/utils/qr.js
import QRCode from 'qrcode';

// Return only the token to encode in QR
export const tokenForRow = (r) => r?.qr_token || r?.public_token || null;

// Kept for compatibility with existing imports.
export const qrForRow = (r) => tokenForRow(r);

// Optional: open a preview window with token-only QR
export async function openQRForRow(r) {
  const token = tokenForRow(r);
  if (!token) return alert('No qr_token/public_token on this record.');
  const dataUrl = await QRCode.toDataURL(token, { margin: 0 });
  const w = window.open('', '_blank', 'width=360,height=420,noopener,noreferrer');
  if (!w) return alert('Popup blocked');
  w.document.write(`
    <!doctype html><title>QR</title>
    <style>
      body{margin:0;font:14px system-ui;text-align:center;padding:12px}
      img{width:320px;height:320px;image-rendering:pixelated;border:1px solid #ddd;border-radius:8px}
    </style>
    <h3>QR Token</h3>
    <img src="${dataUrl}" alt="QR"/>
    <div style="word-break:break-all;margin-top:8px">${token}</div>
  `);
  w.document.close();
}
