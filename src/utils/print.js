// Shared, popup-safe printing + QR helpers
import QRCode from 'qrcode';

/** Print HTML using a hidden iframe (not blocked by popup blockers). */
export const printHTMLViaIframe=(html)=>{
  const iframe=document.createElement('iframe');
  iframe.style.position='fixed'; iframe.style.right='0'; iframe.style.bottom='0';
  iframe.style.width='0'; iframe.style.height='0'; iframe.style.border='0';
  document.body.appendChild(iframe);
  const doc=iframe.contentDocument||iframe.contentWindow?.document;
  doc.open(); doc.write(html); doc.close();
  iframe.onload=async()=>{
    const w=iframe.contentWindow;
    try{await w.document.fonts?.ready;}catch{}
    const imgs=Array.from(w.document.images||[]);
    await Promise.all(imgs.map((img)=>img.decode?img.decode().catch(()=>{}):(img.complete?Promise.resolve():new Promise((res)=>img.addEventListener('load',res,{once:true})))));
    w.focus(); w.print();
    setTimeout(()=>document.body.removeChild(iframe),800);
  };
};

/** Fetch a module asset (e.g., logo import) and return a data URL for embedding in print HTML. */
export const getLogoDataURL=async(logo)=>{
  try{
    const res=await fetch(logo);
    const blob=await res.blob();
    return await new Promise((resolve)=>{
      const rd=new FileReader();
      rd.onload=()=>resolve(rd.result);
      rd.readAsDataURL(blob);
    });
  }catch{ return ''; }
};

/** Make a QR PNG data URL from text payload. */
export const makeQR=(text,opts={})=>QRCode.toDataURL(text,{margin:0,...opts});
