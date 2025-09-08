// src/routes/ScanPage.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  QrCode,
  Camera,
  CameraOff,
  Flashlight,
  ClipboardPaste,
  Link2,
  Search,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { supabase } from '../utils/supabaseClient';
import logo from '../assets/logo.png';
import { resolveInputToPath } from '../utils/globalResolver';

/* ─────────────── Brand palette ─────────────── */
const BRAND = {
  name: 'DigitizerX',
  nameColor: '#1E40AF',
  blue: '#143C8B',
  emerald: '#0F7A5A',
  gradientFrom: '#ecf2ff',
  gradientVia: '#f2f7ff',
  gradientTo: '#eefcf6',
};

const cls = (...a) => a.filter(Boolean).join(' ');

const Skeleton = ({ h = 14 }) => (
  <div className="animate-pulse">
    <div className="rounded bg-slate-200" style={{ height: h }} />
  </div>
);

/* ───────────────────────────── Component ───────────────────────────── */
const ScanPage = () => {
  const nav = useNavigate();

  const [supported, setSupported] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [warming, setWarming] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const [manual, setManual] = useState('');
  const [last, setLast] = useState(null);
  const [resolving, setResolving] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const detectorRef = useRef(null);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'BarcodeDetector' in window);
  }, []);

  // stop on unmount
  useEffect(() => () => stopCamera(), []);

  const startCamera = async () => {
    if (!supported) {
      toast.error('BarcodeDetector not supported on this device/browser.');
      return;
    }
    try {
      setWarming(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      detectorRef.current = new window.BarcodeDetector({
        formats: [
          'qr_code',
          'code_128',
          'code_39',
          'ean_13',
          'ean_8',
          'upc_a',
          'upc_e',
        ],
      });

      setScanning(true);
      setWarming(false);
      loopDetect();
    } catch (e) {
      setWarming(false);
      toast.error(e?.message || 'Camera error');
    }
  };

  const stopCamera = () => {
    setScanning(false);
    setWarming(false);
    try {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    } catch {}
    try {
      streamRef.current?.getTracks()?.forEach((t) => t.stop());
    } catch {}
    streamRef.current = null;
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(!torchOn);
    } catch {
      toast.error('Torch not supported on this device.');
    }
  };

  const loopDetect = async () => {
    if (!scanning || !videoRef.current || !detectorRef.current) return;

    try {
      const codes = await detectorRef.current.detect(videoRef.current);
      if (codes && codes.length) {
        const val = codes[0].rawValue || codes[0].rawValueText || '';
        if (val && val !== last) {
          setLast(val);
          resolveRef(val);
        }
      }
    } catch {}
    rafRef.current = requestAnimationFrame(loopDetect);
  };

  const go = async (raw) => {
    const path = await resolveInputToPath(raw, supabase);
    if (path) {
      nav(path);
      return true;
    }
    return false;
  };

  const resolveRef = async (raw) => {
    setResolving(true);
    await toast
      .promise(
        (async () => {
          const ok = await go(raw);
          if (!ok) throw new Error('No match found');
        })(),
        { loading: 'Finding…', success: 'Found', error: (e) => e?.message || 'No match found' }
      )
      .finally(() => setResolving(false));
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        toast.error('Clipboard is empty');
        return;
      }
      setManual(text);
      resolveRef(text);
    } catch {
      toast.error('Clipboard not available');
    }
  };

  /* ───────────────────────── UI ───────────────────────── */
  return (
    <div className="px-3 py-4 sm:p-6">
      <Toaster position="top-right" />
      <div className="max-w-5xl mx-auto">
        <div className="rounded-2xl border shadow-sm bg-white/80 overflow-hidden">
          {/* Hero */}
          <div
            className="bg-gradient-to-r"
            style={{
              backgroundImage: `linear-gradient(to right, ${BRAND.gradientFrom}, ${BRAND.gradientVia}, ${BRAND.gradientTo})`,
            }}
          >
            <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center justify-center">
                  <div className="text-sm font-bold" style={{ color: BRAND.nameColor }}>
                    {BRAND.name}
                  </div>
                  <img src={logo} alt="Logo" className="h-10 w-auto mt-1" />
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-extrabold" style={{ color: BRAND.blue }}>
                    Universal Scanner
                  </div>
                  <div className="text-sm text-slate-600">
                    Scan equipment, PM, or inventory labels; tokens, WO codes, or links all work.
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {!scanning ? (
                  <button
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white hover:bg-slate-50"
                    onClick={startCamera}
                    title="Start camera"
                  >
                    <Camera size={16} /> Open Camera
                  </button>
                ) : (
                  <>
                    <button
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white hover:bg-slate-50"
                      onClick={stopCamera}
                      title="Stop camera"
                    >
                      <CameraOff size={16} /> Stop
                    </button>
                    <button
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white hover:bg-slate-50"
                      onClick={toggleTorch}
                      title="Toggle torch"
                    >
                      <Flashlight size={16} /> {torchOn ? 'Torch Off' : 'Torch On'}
                    </button>
                  </>
                )}
                <button
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white hover:bg-slate-50"
                  onClick={pasteFromClipboard}
                  title="Paste from clipboard"
                >
                  <ClipboardPaste size={16} /> Paste
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border bg-white overflow-hidden">
                <div className="p-3 border-b bg-slate-50 text-sm flex items-center gap-2">
                  <QrCode size={16} className="text-indigo-700" /> Live Camera
                  {!supported && (
                    <span className="ml-auto inline-flex items-center gap-1 text-amber-700 text-xs">
                      <AlertTriangle size={14} /> Not supported on this device
                    </span>
                  )}
                  {warming && <span className="ml-auto text-xs text-slate-500">Starting…</span>}
                  {scanning && !warming && (
                    <span className="ml-auto text-xs text-emerald-700 inline-flex items-center gap-1">
                      <CheckCircle2 size={14} /> Ready
                    </span>
                  )}
                </div>

                <div className="relative bg-black">
                  {warming ? (
                    <div className="p-6">
                      <Skeleton h={200} />
                    </div>
                  ) : (
                    <video
                      ref={videoRef}
                      muted
                      playsInline
                      style={{ width: '100%', height: 320, objectFit: 'cover' }}
                    />
                  )}

                  {scanning && !warming && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="w-[85%] h-[70%] border-2 border-white/80 rounded-xl relative overflow-hidden">
                        <div className="absolute inset-x-0 h-[2px] bg-emerald-400/90 animate-[scan_2.2s_ease-in-out_infinite]" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3 text-xs text-slate-600">
                  Tip: JSON payloads like <code>{"{ type:'part', part_uid:'…' }"}</code> or{' '}
                  <code>{"{ type:'bin', plant_id:'Plant1', bin_code:'BIN-A1' }"}</code> are supported.
                </div>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Search size={16} className="text-indigo-700" /> Manual Entry
                </div>
                <div className="text-xs text-slate-600 mb-3">
                  Enter a WO code, equipment code, UUID token, inventory link, or a JSON payload.
                </div>
                <div className="flex gap-2">
                  <input
                    value={manual}
                    onChange={(e) => setManual(e.target.value)}
                    placeholder='WO-1SJ44WH • HVAC-001 • 123e4567-e89b-12d3-a456-426614174000 • {"type":"bin",...}'
                    className={cls(
                      'flex-1 border rounded-lg px-3 py-2 text-sm',
                      'focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'
                    )}
                  />
                  <button
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border bg-white hover:bg-slate-50"
                    onClick={() => resolveRef(manual)}
                    disabled={resolving || !manual.trim()}
                  >
                    <Link2 size={16} /> Open
                  </button>
                </div>
                {last && (
                  <div className="mt-3 text-xs text-slate-600">
                    Last scanned:&nbsp;<span className="font-mono break-all">{last}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 rounded-xl border bg-slate-50 px-4 py-3 text-xs text-slate-600">
              Works on modern mobile browsers. If camera isn’t available, use <b>Paste</b> or manual
              entry.
            </div>
          </div>
        </div>
      </div>

      {/* scan line keyframes */}
      <style>{`
        @keyframes scan {
          0%   { transform: translateY(-4%); }
          50%  { transform: translateY(96%); }
          100% { transform: translateY(-4%); }
        }
      `}</style>
    </div>
  );
};

export default ScanPage;
