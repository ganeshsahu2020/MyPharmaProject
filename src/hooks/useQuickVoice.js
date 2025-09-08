// src/hooks/useQuickVoice.js
import { useEffect, useRef, useState } from "react";

export function useQuickVoice() {
  // Web Speech detection (Chrome ships webkitSpeechRecognition)
  const SR =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  const TTS = typeof window !== "undefined" && window.speechSynthesis;

  const [state, setState] = useState({
    isRecording: false,
    level: 0,
    transcript: "",
    error: "",
  });

  const recogRef = useRef(null);
  const cfgRef = useRef({ lang: "en-IN" });
  const endCbRef = useRef(null);
  const levelIdRef = useRef(null);

  // Must be https or localhost
  const micSupported =
    !!SR && (typeof window !== "undefined") &&
    (window.isSecureContext || window.location.hostname === "localhost");

  useEffect(() => {
    if (!micSupported) return;

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new Recognition();
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.lang = cfgRef.current.lang || "en-IN";

    r.onstart = () => {
      setState((s) => ({ ...s, isRecording: true, error: "", transcript: "" }));
      if (!levelIdRef.current) {
        levelIdRef.current = setInterval(() => {
          setState((s) => ({ ...s, level: Math.random() * 0.8 + 0.2 }));
        }, 120);
      }
    };

    r.onresult = (ev) => {
      const t = (ev.results?.[0]?.[0]?.transcript || "").trim();
      setState((s) => ({ ...s, transcript: t }));
      // deliver to stop(cb) if registered
      endCbRef.current?.(t);
    };

    r.onerror = (ev) => {
      setState((s) => ({ ...s, error: ev?.error || "speech-error" }));
      endCbRef.current?.("");
    };

    r.onend = () => {
      if (levelIdRef.current) {
        clearInterval(levelIdRef.current);
        levelIdRef.current = null;
      }
      setState((s) => ({ ...s, isRecording: false, level: 0 }));
      if (endCbRef.current) {
        const cb = endCbRef.current;
        endCbRef.current = null;
        cb(state.transcript || "");
      }
    };

    recogRef.current = r;

    return () => {
      try { r.abort?.(); } catch {}
      if (levelIdRef.current) {
        clearInterval(levelIdRef.current);
        levelIdRef.current = null;
      }
      recogRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micSupported]);

  const setConfig = (cfg) => {
    cfgRef.current = { ...cfgRef.current, ...(cfg || {}) };
    if (recogRef.current && cfg?.lang) {
      try { recogRef.current.lang = cfg.lang; } catch {}
    }
  };

  const start = () => {
    if (!micSupported || !recogRef.current) return;
    try { recogRef.current.start(); } catch {/* already started, ignore */}
  };

  const stop = (onFinalTranscript) => {
    endCbRef.current = typeof onFinalTranscript === "function" ? onFinalTranscript : null;

    if (!recogRef.current) {
      if (endCbRef.current) {
        const cb = endCbRef.current;
        endCbRef.current = null;
        cb("");
      }
      return;
    }
    try { recogRef.current.stop(); } catch {}
  };

  const speak = (text, voiceName, opts = {}) => {
    if (!TTS || !text) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      const voices = TTS.getVoices?.() || [];
      u.voice = voices.find((v) => v.name === voiceName) || null;
      u.lang = opts.lang || "en-IN";
      u.rate = Math.max(0.5, Math.min(2.0, Number(opts.rate ?? 1)));
      u.pitch = Math.max(0.1, Math.min(2.0, Number(opts.pitch ?? 1)));
      u.volume = Math.max(0, Math.min(1, Number(opts.volume ?? 1)));
      if (opts.interrupt) { try { TTS.cancel(); } catch {} }
      TTS.speak(u);
    } catch {}
  };

  return { state, micSupported, setConfig, start, stop, speak };
}

export default useQuickVoice;
