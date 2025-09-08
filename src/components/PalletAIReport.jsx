// src/components/PalletAIReport.jsx
import React, { useMemo, useRef, useState } from "react";
import {
  Search, Sparkles, FileText, Download, Loader2, Info, Filter, Box,
  Truck, Clock, BadgeCheck, ClipboardList, Database, Play, Pause, Square, Languages,
  Image as ImageIcon
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import Button from "./ui/Button";
import { supabase } from "../utils/supabaseClient";
import { getPalletFacts } from "../data/palletFacts";
import logo from "../assets/logo.png"; // used in header + PDF

const AI_BASE = import.meta.env.VITE_SUPABASE_URL || "";
const AI_ENDPOINT = AI_BASE + (import.meta.env.VITE_AI_ENDPOINT || "/functions/v1/ai-ask");

/* ----- tiny utils ----- */
const n3 = (n) => (n == null ? "-" : Number(n).toFixed(3));
const dt = (s) => (s ? new Date(s).toLocaleString() : "-");

/* ----- very light md->html (we only render AI text) ----- */
const mdToHtml = (raw = "") => {
  let s = String(raw || "");
  s = s
    .replace(/^######\s?(.*)$/gm, "<h6>$1</h6>")
    .replace(/^#####\s?(.*)$/gm, "<h5>$1</h5>")
    .replace(/^####\s?(.*)$/gm, "<h4>$1</h4>")
    .replace(/^###\s?(.*)$/gm, "<h3>$1</h3>")
    .replace(/^##\s?(.*)$/gm, "<h2>$1</h2>")
    .replace(/^#\s?(.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<i>$1</i>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/^(?!<h\d|<p|<\/p>)(.+)$/gm, "<p>$1</p>")
    .replace(/\n/g, "<br/>");
  return s;
};

const LOCALES = [
  { v: "en-IN", label: "English (India)" },
  { v: "en-US", label: "English (US)" },
  { v: "en-GB", label: "English (UK)" },
];

/* -------- build a strict, professional report prompt -------- */
const buildReportPrompt = (data, kind, query) => {
  const mCode = data?.label?.material_code || data?.material?.code || query || "Material";
  const mDesc = data?.label?.material_desc || data?.material?.desc || "";

  return [
    "You are an operations assistant. Produce a concise, professional palletization report.",
    "Rules:",
    "- Output plain text only. Do NOT use Markdown headings (#), tables, or the words 'Who', 'What', 'How', or 'When' as section titles.",
    "- Tone: formal, neutral, audit-friendly. Short sentences and labeled lines are OK.",
    "- If any field is missing, write 'Not specified'.",
    "",
    `Opening line (exact style): Welcome to DigitizerX — Report for ${mCode}${mDesc ? " — " + mDesc : ""}.`,
    "",
    "Key details (single lines, labeled):",
    "- Quantity: <live quantity + UOM>",
    "- Containers: <live containers>",
    "- Location: <location code> (Status: <status>)",
    "- Expiry: <exp_date>",
    "- Retest: <next_inspection_date>",
    "- Storage: <storage_condition>",
    "- QC Status: <quality_status> (Changed: <quality_changed_at>)",
    "- Vendor: <vendor_code> / Batch: <vendor_batch_no>",
    "- Manufacturer: <manufacturer>",
    "- Printed: <printed_by> at <printed_at>",
    "",
    "Movements:",
    "- Chronological storage hops. Each line: [time] <type>: <from> → <to>, qty <qty>, ctn <containers>. Limit to the most relevant 6–10 lines.",
    "",
    "Finish with a courteous closing line: Thank you.",
    "",
    `Work strictly from this JSON: ${JSON.stringify(data)}`
  ].join("\n");
};

/* -------- sanitize AI text for speech (no '#', no Who/What/How/When) -------- */
const cleanForSpeech = (text, facts) => {
  let s = String(text || "");
  s = s.replace(/```[\s\S]*?```/g, "");
  s = s.replace(/^\s*#+\s*/gm, "");
  s = s.replace(/^\s*(who|what|how|when)\s*:\s*/gim, "");
  s = s.replace(/\n{3,}/g, "\n\n");
  const code = facts?.label?.material_code || facts?.material?.code || "Material";
  const desc = facts?.label?.material_desc || facts?.material?.desc || "";
  if (!/^Welcome to DigitizerX/i.test(s)) {
    const header = `Welcome to DigitizerX — Report for ${code}${desc ? " — " + desc : ""}. `;
    s = header + s;
  }
  return s;
};

/* ---- build aligned detail rows (Key–Value | Key–Value) ---- */
const buildDetailRows = (facts) => {
  const qtyDisp = `${n3(facts?.current?.qty)} ${facts?.label?.uom || ""}`;
  const rows = [
    { type: "section", title: "Location & Live" },
    { lk: "Location Code", lv: facts?.current?.location_code, rk: "Status", rv: facts?.current?.status },
    { lk: "Live Qty", lv: qtyDisp, rk: "Live Containers", rv: facts?.current?.containers },
    { lk: "Placed At", lv: dt(facts?.current?.placed_at), rk: "Updated At", rv: dt(facts?.current?.updated_at) },

    { type: "section", title: "Label & GRN" },
    { lk: "GRN No", lv: facts?.label?.grn_no, rk: "Line No", rv: facts?.label?.line_no },
    { lk: "Item Code", lv: facts?.label?.item_code, rk: "Material Code", rv: facts?.label?.material_code },
    { lk: "Material Desc", lv: facts?.label?.material_desc, rk: "UOM", rv: facts?.label?.uom },
    { lk: "Label Net Qty", lv: n3(facts?.label?.net_qty), rk: "Label Containers", rv: facts?.label?.num_containers },

    { type: "section", title: "Label Meta" },
    { lk: "Item Batch No.", lv: facts?.label?.item_batch_no, rk: "Invoice No", rv: facts?.label?.invoice_no },
    { lk: "Printed By", lv: facts?.label?.printed_by, rk: "Printed At", rv: dt(facts?.label?.printed_at) },

    { type: "section", title: "Vendor • Shipping • Storage" },
    { lk: "Vendor Code", lv: facts?.label?.vendor_code, rk: "Vendor Batch", rv: facts?.label?.vendor_batch_no },
    { lk: "Manufacturer", lv: facts?.label?.manufacturer, rk: "Exp Date", rv: facts?.label?.exp_date },
    { lk: "Next Inspection", lv: facts?.label?.next_inspection_date, rk: "Storage Condition", rv: facts?.label?.storage_condition || facts?.header_extra?.storage_condition },
    { lk: "LR No", lv: facts?.header_extra?.lr_no, rk: "Transporter", rv: facts?.header_extra?.transporter },
  ];
  return rows;
};

export default function PalletAIReport() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [facts, setFacts] = useState(null);
  const [aiText, setAiText] = useState("");
  const [voiceLang, setVoiceLang] = useState("en-IN");
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [ttsState, setTtsState] = useState("idle");

  const reportRef = useRef(null); // PNG capture target

  const kind = useMemo(() => {
    const t = String(token || "").trim();
    if (/^LBL[-_]/i.test(t)) return "label";
    return t ? "material" : "";
  }, [token]);

  const run = async () => {
    const query = String(token || "").trim();
    if (!query) return;

    setBusy(true);
    setAiText("");
    try {
      // 1) Build palletization facts
      const data = await getPalletFacts(query);
      setFacts(data);

      // 2) Ask AI for professional narrative
      let bearer = import.meta.env.VITE_SUPABASE_ANON_KEY;
      try {
        const { data: auth } = await supabase.auth.getSession();
        if (auth?.session?.access_token) bearer = auth.session.access_token;
      } catch {}

      const prompt = buildReportPrompt(data, kind, query);

      const r = await fetch(AI_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify({ query: prompt, mode: "gen", topK: 0, minSim: 0.6 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "AI call failed");
      setAiText(j.answer || "");

      if (autoSpeak) speakNow(j.answer || "Palletization report is ready.", data);
    } catch (e) {
      alert(e?.message || "Failed to generate report");
    } finally {
      setBusy(false);
    }
  };

  /* ---- small speech helper (now sanitized) ---- */
  const speakNow = (text, f = facts) => {
    try {
      const clean = cleanForSpeech(text, f);
      const msg = new SpeechSynthesisUtterance(clean);
      msg.lang = voiceLang;
      msg.onstart = () => setTtsState("playing");
      msg.onend = () => setTtsState("idle");
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(msg);
    } catch {}
  };
  const pauseTTS = () => { try { window.speechSynthesis.pause(); setTtsState("paused"); } catch {} };
  const resumeTTS = () => { try { window.speechSynthesis.resume(); setTtsState("playing"); } catch {} };
  const stopTTS = () => { try { window.speechSynthesis.cancel(); setTtsState("idle"); } catch {} };

  /* ---- export events as CSV ---- */
  const exportCSV = () => {
    const rows = facts?.events || [];
    if (!rows.length) return;

    const header = ["Time","Type","From","To","Qty","ΔQty","Ctn","ΔCtn","By","Reason","Note"];
    const csv = [
      header.join(","),
      ...rows.map((m) =>
        [
          dt(m.event_at || m.created_at),
          `"${m.event_type || ""}"`,
          `"${m.from_location || ""}"`,
          `"${m.to_location || ""}"`,
          n3(m.qty),
          m.delta_qty == null ? "" : n3(m.delta_qty),
          m.container_count == null ? "" : m.container_count,
          m.delta_containers == null ? "" : m.delta_containers,
          `"${m.done_by || ""}"`,
          `"${m.movement_reason || ""}"`,
          `"${m.movement_note || ""}"`,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const base = facts?.label?.uid || facts?.material?.code || "palletization";
    a.download = `palletization_${base}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ---- export report PNG (white background so it looks great in dark mode) ---- */
  const exportPNG = async () => {
    if (!reportRef.current) return;
    const { toPng } = await import("html-to-image"); // npm i html-to-image
    const node = reportRef.current;
    const dataUrl = await toPng(node, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#ffffff"
    });
    const a = document.createElement("a");
    const base = facts?.label?.uid || facts?.material?.code || "palletization";
    a.download = `Palletization_${base}.png`;
    a.href = dataUrl;
    a.click();
  };

  /* ---- export report PDF (brand header + watermark on every page) ---- */
  const exportPDF = async () => {
    if (!facts) return;
    const { default: jsPDF } = await import("jspdf"); // npm i jspdf
    const doc = new jsPDF({ unit: "pt" });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    const paintHeader = () => {
      try { doc.addImage(logo, "PNG", 32, 24, 36, 36); } catch {}
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("DigitizerX", 80, 40);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text("Palletization Report", 80, 58);

      // Watermark (large, faint text)
      doc.setTextColor(210, 210, 210);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(72);
      doc.text("DigitizerX", pageW / 2, pageH / 2, { align: "center", angle: -30 });
      doc.setTextColor(0, 0, 0);

      // return content start Y
      return 88;
    };

    const leftX = 32;
    const rightX = 310;
    const tx = (x, y, k, v) => {
      doc.setFont("helvetica", "bold");
      doc.text(String(k || "-"), x, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(v == null || v === "" ? "-" : v), x + 130, y);
    };

    let y = paintHeader();
    const qtyDisp = `${n3(facts?.current?.qty)} ${facts?.label?.uom || ""}`;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Material Details", leftX, y);
    y += 14; doc.setFontSize(10); doc.setLineWidth(0.5); doc.line(leftX, y, pageW - 32, y); y += 16;

    // Left column / right column lines
    tx(leftX, y, "Location Code", facts?.current?.location_code);  tx(rightX, y, "Status", facts?.current?.status);                y += 16;
    tx(leftX, y, "Live Qty", qtyDisp);                             tx(rightX, y, "Live Containers", facts?.current?.containers);   y += 16;
    tx(leftX, y, "Placed At", dt(facts?.current?.placed_at));      tx(rightX, y, "Updated At", dt(facts?.current?.updated_at));   y += 20;

    doc.setFont("helvetica", "bold"); doc.text("Label & GRN", leftX, y); y += 14; doc.line(leftX, y, pageW - 32, y); y += 16;
    tx(leftX, y, "GRN No", facts?.label?.grn_no);                  tx(rightX, y, "Line No", facts?.label?.line_no);               y += 16;
    tx(leftX, y, "Item Code", facts?.label?.item_code);            tx(rightX, y, "Material Code", facts?.label?.material_code);   y += 16;
    tx(leftX, y, "Material Desc", facts?.label?.material_desc);    tx(rightX, y, "UOM", facts?.label?.uom);                       y += 16;
    tx(leftX, y, "Label Net Qty", n3(facts?.label?.net_qty));      tx(rightX, y, "Label Containers", facts?.label?.num_containers); y += 20;

    doc.setFont("helvetica", "bold"); doc.text("Label Meta", leftX, y); y += 14; doc.line(leftX, y, pageW - 32, y); y += 16;
    tx(leftX, y, "Item Batch No.", facts?.label?.item_batch_no);   tx(rightX, y, "Invoice No", facts?.label?.invoice_no);         y += 16;
    tx(leftX, y, "Printed By", facts?.label?.printed_by);          tx(rightX, y, "Printed At", dt(facts?.label?.printed_at));     y += 20;

    doc.setFont("helvetica", "bold"); doc.text("Vendor • Shipping • Storage", leftX, y); y += 14; doc.line(leftX, y, pageW - 32, y); y += 16;
    tx(leftX, y, "Vendor Code", facts?.label?.vendor_code);        tx(rightX, y, "Vendor Batch", facts?.label?.vendor_batch_no);  y += 16;
    tx(leftX, y, "Manufacturer", facts?.label?.manufacturer);      tx(rightX, y, "Exp Date", facts?.label?.exp_date);             y += 16;
    tx(leftX, y, "Next Inspection", facts?.label?.next_inspection_date);
    tx(rightX, y, "Storage Condition", facts?.label?.storage_condition || facts?.header_extra?.storage_condition); y += 16;
    tx(leftX, y, "LR No", facts?.header_extra?.lr_no);             tx(rightX, y, "Transporter", facts?.header_extra?.transporter); y += 24;

    // Movements
    doc.setFont("helvetica", "bold"); doc.text("Movements", leftX, y); y += 14; doc.line(leftX, y, pageW - 32, y); y += 16;
    doc.setFont("courier", "normal");
    const events = (facts?.events || []).slice(0, 10);
    for (const m of events) {
      const row = `[${dt(m.event_at || m.created_at)}] ${m.event_type || ""}: ${(m.from_location || "-")} → ${(m.to_location || "-")}, qty ${n3(m.qty)}, ctn ${m.container_count ?? "-"}`;
      const lines = doc.splitTextToSize(row, pageW - 64);
      if (y + lines.length * 14 > pageH - 48) { doc.addPage(); y = paintHeader(); }
      doc.text(lines, leftX, y);
      y += 14 + (lines.length - 1) * 12;
    }

    // Footer
    y += 18;
    if (y > pageH - 32) { doc.addPage(); y = paintHeader() + 14; }
    doc.setFont("helvetica", "normal");
    doc.text("Generated by DigitizerX", leftX, y);

    const base = facts?.label?.uid || facts?.material?.code || "palletization";
    doc.save(`Palletization_Report_${base}.pdf`);
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="rounded-xl mb-6 overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-5 md:px-7 py-5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <img src={logo} alt="DigitizerX" className="h-8 w-8 rounded-md bg-white/90 p-1" />
            <div className="text-xl md:text-2xl font-semibold tracking-tight flex items-center gap-2">
              <span>DigitizerX • Palletization Report</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* Back to AI button */}
            <Link
              to="/ai"
              className="px-3 py-1.5 rounded-md text-xs font-medium border bg-white/10 text-white border-white/30 hover:bg-white/20"
              title="Back to Assistant"
            >
              Back to Assistant
            </Link>
            <span className="text-xs opacity-90">
              Query by <b>Label UID</b> or <b>Material Code</b>
            </span>
          </div>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl font-semibold text-blue-800 flex items-center gap-2">
            <ClipboardList size={16} />
            Generate Report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-600 pointer-events-none" />
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter Label UID (e.g. LBL-GRN-...) or Material Code (e.g. API-009)"
                className="w-[440px] pl-10 pr-40 py-2.5 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                aria-label="Search Label or Material"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-2">
                <Button type="button" onClick={() => setToken("")} variant="secondary">
                  Clear
                </Button>
                <Button type="button" onClick={run} disabled={!token || busy}>
                  {busy ? (
                    <>
                      <Loader2 size={14} className="animate-spin mr-1" />
                      Working…
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} className="mr-1" />
                      Generate
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <label className="text-xs inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoSpeak}
                  onChange={(e) => setAutoSpeak(e.target.checked)}
                />
                Auto-speak
              </label>
              <div className="text-xs text-slate-600 flex items-center gap-2">
                <Languages size={12} className="text-blue-700" />
                <select
                  value={voiceLang}
                  onChange={(e) => setVoiceLang(e.target.value)}
                  className="text-xs border rounded px-1.5 py-1 bg-white"
                >
                  {LOCALES.map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* TTS transport */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="h-8 w-8 grid place-items-center rounded border bg-white text-blue-700"
                  title="Play / Resume"
                  onClick={() =>
                    speakNow(aiText || "No report yet. Generate a report first.")
                  }
                >
                  <Play size={14} />
                </button>
                <button
                  type="button"
                  className="h-8 w-8 grid place-items-center rounded border bg-white text-blue-700 disabled:opacity-40"
                  title="Pause"
                  onClick={pauseTTS}
                  disabled={ttsState !== "playing"}
                >
                  <Pause size={14} />
                </button>
                <button
                  type="button"
                  className="h-8 w-8 grid place-items-center rounded border bg-white text-blue-700 disabled:opacity-40"
                  title="Stop"
                  onClick={stopTTS}
                  disabled={ttsState === "idle"}
                >
                  <Square size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* AI Narrative */}
          <Card className="p-3 md:p-4">
            {aiText ? (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: mdToHtml(aiText) }}
              />
            ) : (
              <div className="text-sm text-slate-600 flex items-center gap-2">
                <Info size={14} />
                Enter a value and click <b>Generate</b> to see the palletization-only
                narrative (professional format).
              </div>
            )}
          </Card>

          {/* Facts snapshot */}
          {facts && (
            <div ref={reportRef} className="space-y-3">
              {/* Header cards */}
              <div className="grid md:grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-xs text-slate-500 mb-1">Identifier</div>
                    <div className="flex items-center gap-2">
                      <BadgeCheck size={16} className="text-blue-700" />
                      <div className="text-sm">
                        <div className="font-semibold">
                          {facts.label?.uid || facts.material?.code || "-"}
                        </div>
                        <div className="text-slate-500">
                          {facts.label?.material_code
                            ? `${facts.label.material_code} • ${facts.label.material_desc || ""}`
                            : facts.material?.desc || ""}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="text-xs text-slate-500 mb-1">Current Location</div>
                    <div className="flex items-center gap-2">
                      <Box size={16} className="text-emerald-700" />
                      <div className="text-sm">
                        <div className="font-semibold">
                          {facts.current?.location_code || "-"} ({facts.current?.status || "-"})
                        </div>
                        <div className="text-slate-500">
                          Qty {n3(facts.current?.qty)} {facts.label?.uom || ""} • Ctn{" "}
                          {facts.current?.containers ?? "-"}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="text-xs text-slate-500 mb-1">QC Status</div>
                    <div className="flex items-center gap-2">
                      <Filter size={16} className="text-amber-700" />
                      <div className="text-sm">
                        <div className="font-semibold">{facts.qc?.quality_status || "-"}</div>
                        <div className="text-slate-500">
                          Updated {dt(facts.qc?.quality_changed_at)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Material Details (aligned grid) */}
              <Card className="bg-gray-50 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <FileText size={16} />
                    Material Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DetailsGrid rows={buildDetailRows(facts)} />
                </CardContent>
              </Card>

              {/* Movement Events */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <Truck size={16} />
                    Palletization & Storage Movements
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative max-h-[520px] overflow-auto rounded-md border">
                    <table className="min-w-[1200px] w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur supports-[backdrop-filter]:bg-slate-50/75 text-slate-700">
                        <tr>
                          <Th>Time</Th>
                          <Th>Type</Th>
                          <Th>From</Th>
                          <Th>To</Th>
                          <Th className="text-right">Qty</Th>
                          <Th className="text-right">ΔQty</Th>
                          <Th className="text-right">Ctn</Th>
                          <Th className="text-right">ΔCtn</Th>
                          <Th>By</Th>
                          <Th>Reason</Th>
                          <Th>Note</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {(facts.events || []).map((m, i) => (
                          <tr key={i} className="odd:bg-white even:bg-slate-50/40">
                            <Td>{dt(m.event_at || m.created_at)}</Td>
                            <Td>{m.event_type}</Td>
                            <Td>{m.from_location || "-"}</Td>
                            <Td>{m.to_location || "-"}</Td>
                            <Td className="text-right">{n3(m.qty)}</Td>
                            <Td className="text-right">
                              {m.delta_qty == null ? "-" : n3(m.delta_qty)}
                            </Td>
                            <Td className="text-right">
                              {m.container_count == null ? "-" : m.container_count}
                            </Td>
                            <Td className="text-right">
                              {m.delta_containers == null ? "-" : m.delta_containers}
                            </Td>
                            <Td>{m.done_by || "-"}</Td>
                            <Td>{m.movement_reason || "-"}</Td>
                            <Td>{m.movement_note || "-"}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <Button variant="outline" onClick={exportCSV}>
                      <Download size={14} className="mr-1" />
                      Export CSV
                    </Button>
                    <Button variant="outline" onClick={exportPNG}>
                      <ImageIcon size={14} className="mr-1" />
                      PNG
                    </Button>
                    <Button variant="outline" onClick={exportPDF}>
                      <Download size={14} className="mr-1" />
                      Download PDF
                    </Button>
                    <div className="ml-auto text-xs text-slate-500 flex items-center gap-2">
                      <Clock size={12} />
                      <span>
                        First: <b>{dt(facts.meta?.first_event)}</b>
                      </span>
                      <span className="mx-1">•</span>
                      <span>
                        Last: <b>{dt(facts.meta?.last_event)}</b>
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- aligned details grid ---------- */
const DetailsGrid = ({ rows = [] }) => {
  return (
    <div className="rounded-md border bg-white/60">
      {rows.map((r, i) => {
        if (r.type === "section") {
          return (
            <div
              key={`sec-${i}`}
              className="px-3 py-2 text-xs font-semibold tracking-wide text-slate-600 bg-slate-50 border-b"
            >
              {r.title}
            </div>
          );
        }
        return (
          <div
            key={i}
            className="grid items-center gap-x-2 px-3 py-2 border-b last:border-b-0
                       [grid-template-columns:clamp(110px,17vw,160px)_1fr_clamp(110px,17vw,160px)_1fr]"
          >
            <div className="text-slate-500 text-sm">{r.lk}</div>
            <div className="font-medium text-sm break-words">{fmtVal(r.lv)}</div>
            <div className="text-slate-500 text-sm">{r.rk}</div>
            <div className="font-medium text-sm break-words">{fmtVal(r.rv)}</div>
          </div>
        );
      })}
    </div>
  );
};

const fmtVal = (v) => (v == null || v === "" ? "-" : String(v));

/* ---------- tiny presentational helpers ---------- */
const Th = ({ children, className = "" }) => (
  <th className={`text-left px-3 py-2 border-b ${className}`}>{children}</th>
);
const Td = ({ children, className = "" }) => (
  <td className={`px-3 py-2 border-b ${className}`}>{children}</td>
);
