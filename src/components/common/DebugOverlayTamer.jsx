import React, { useEffect, useState } from "react";

/** Never throws; returns a lowercase key or "" */
function safeKey(evt) {
  try {
    if (typeof evt === "string") return evt.toLowerCase();
    const raw = evt?.key ?? evt?.code ?? "";
    return String(raw).toLowerCase();
  } catch {
    return "";
  }
}

export default function DebugOverlayTamer() {
  const isDev = Boolean(import.meta?.env?.DEV);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isDev) return;
    if (typeof window === "undefined") return;

    const onKey = (e) => {
      const k = safeKey(e); // never throws
      if (!k) return;

      const ctrl = e?.ctrlKey === true || e?.metaKey === true;

      // Toggle: Ctrl/? + Alt + D  OR  Ctrl/? + `
      if ((ctrl && e?.altKey && k === "d") || (ctrl && (k === "`" || k === "~"))) {
        e?.preventDefault?.();
        setOpen((v) => !v);
        return;
      }

      if (k === "escape") setOpen(false);
    };

    window.addEventListener("keydown", onKey); // not passive (we may preventDefault)
    return () => window.removeEventListener("keydown", onKey);
  }, [isDev]);

  if (!isDev || !open) return null;

  return (
    <div className="fixed bottom-2 left-2 z-50 rounded bg-black/80 text-white text-xs px-3 py-2 shadow-lg">
      <div className="font-semibold">Debug Overlay</div>
      <div>Toggle: Ctrl/?+Alt+D (or Ctrl+`)</div>
    </div>
  );
}
