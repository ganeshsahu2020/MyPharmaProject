// src/components/submodules/materialinward/LabelPrinting.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../utils/supabaseClient";
import { useAuth } from "../../../contexts/AuthContext";
import toast from "react-hot-toast";

import Button from "../../ui/button";
import { Card } from "../../ui/card";
import Input from "../../ui/Input";
import Label from "../../ui/Label";
import { Skeleton } from "../../ui/skeleton";

import { PackageSearch, Printer, RefreshCw, History, FileText } from "lucide-react";

/**
 * Material Label Printing
 * - Select a GRN
 * - Fetch lines from grn_postings (+ resolve UOM)
 * - When printing, fetch exact container splits from vw_grn_line_containers
 *   so each label reflects its true container quantity.
 */

const PRINT_HEADER_BLUE = "#1f4bd8";
const STORAGE_DEFAULT =
  "Keep in well closed container and stored at temperature not exceeding 25°C";

const fmtDate = (d) => {
  if (!d) return "";
  try {
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return d;
    return x.toLocaleDateString();
  } catch {
    return d || "";
  }
};

const toYMD = (d) => {
  if (!d) return null;
  if (typeof d === "string") return d.slice(0, 10);
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return null;
  }
};

// Use row-aware decimals if available
const fmtQty = (val, dec = 3) => Number(val ?? 0).toFixed(dec);

// Deterministic UID (helpful for reprints). We’ll still accept external UIDs for reprint.
const uidFor = (grn_no, line_no, i) =>
  `LBL-${String(grn_no)}-${String(line_no).padStart(4, "0")}-${String(i).padStart(4, "0")}`;

const QR_URL = (data) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(data)}`;

/* ---------------------- UOM RESOLUTION HELPERS ---------------------- */

const normalizeRawUom = (s) => (s ?? "").toString().trim();

const splitUomKinds = (raws) => {
  const erp = new Set();
  const sym = new Set();
  for (const r of raws || []) {
    const x = normalizeRawUom(r);
    if (!x) continue;
    if (/^UOM[0-9]+$/i.test(x)) erp.add(x.toUpperCase());
    else sym.add(x);
  }
  return { erp: Array.from(erp), sym: Array.from(sym) };
};

const explodeCase = (arr) => {
  const s = new Set();
  for (const v of arr || []) {
    s.add(v);
    s.add(v.toLowerCase());
    s.add(v.toUpperCase());
  }
  return Array.from(s);
};

const fetchUomLookup = async ({ erp = [], sym = [] }) => {
  const mapByERP = new Map(); // key: erp_id
  const mapBySym = new Map(); // key: uom (symbol)

  try {
    if (erp.length) {
      const q1 = await supabase
        .from("vw_uom_lookup")
        .select("erp_id,uom,uom_name,decimals")
        .in("erp_id", erp);
      if (!q1.error) {
        (q1.data || []).forEach((r) =>
          mapByERP.set(r.erp_id, { uom: r.uom, uom_name: r.uom_name, decimals: r.decimals })
        );
      }
    }
  } catch (e) {
    console.warn("UOM lookup by erp_id failed:", e?.message || e);
  }

  try {
    if (sym.length) {
      const q2 = await supabase
        .from("vw_uom_lookup")
        .select("uom,uom_name,decimals")
        .in("uom", explodeCase(sym));
      if (!q2.error) {
        (q2.data || []).forEach((r) =>
          mapBySym.set(r.uom, { uom: r.uom, uom_name: r.uom_name, decimals: r.decimals })
        );
      }
    }
  } catch (e) {
    console.warn("UOM lookup by symbol failed:", e?.message || e);
  }

  return { mapByERP, mapBySym };
};

const resolveUomRows = async (rows) => {
  const raws = (rows || []).map((r) => r.uom).filter(Boolean);
  const { erp, sym } = splitUomKinds(raws);
  const { mapByERP, mapBySym } = await fetchUomLookup({ erp, sym });

  return (rows || []).map((r) => {
    const raw = normalizeRawUom(r.uom);
    let def = null;
    if (/^UOM[0-9]+$/i.test(raw)) {
      def = mapByERP.get(raw.toUpperCase()) || null;
    } else {
      def =
        mapBySym.get(raw) ||
        mapBySym.get(raw.toUpperCase()) ||
        mapBySym.get(raw.toLowerCase()) ||
        null;
    }
    return {
      ...r,
      uom_raw: r.uom,
      uom_resolved: def?.uom ?? r.uom,
      uom_name: def?.uom_name ?? null,
      uom_decimals: def?.decimals ?? 3,
    };
  });
};

/* ------------------------------------------------------------------- */

const LabelPrinting = () => {
  const { session } = useAuth() || {};
  const user = session?.user || null;
  const userEmail = user?.email || user?.user_metadata?.name || "user";

  const [loading, setLoading] = useState(false);
  const [grnList, setGrnList] = useState([]);
  const [grnSelected, setGrnSelected] = useState("");
  const [lines, setLines] = useState([]);
  const [packSizeByKey, setPackSizeByKey] = useState({});
  const [history, setHistory] = useState([]);

  // Load recent GRNs
  const loadRecentGrns = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("grn_headers")
        .select("grn_no, created_at")
        .order("created_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      setGrnList(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      toast.error("Unable to load GRN list");
    } finally {
      setLoading(false);
    }
  };

  // Helpers for per-row display of Qty/Container
  const buildPerDisplay = (splits, fallbackPer) => {
    if (!splits?.length) return fallbackPer ?? null;
    const first = Number(splits[0].net_qty || 0);
    const allEqual = splits.every((s) => Number(s.net_qty || 0) === first);
    return allEqual ? first : null; // null => show "–"
  };

  // Load postings for selected GRN; also prefetch all splits for this GRN
  const loadGrnLines = async (grn) => {
    if (!grn) return;
    setLoading(true);
    try {
      // 1) Lines
      let q = await supabase
        .from("grn_postings")
        .select(
          `
          grn_no, line_no, kind, item_code, material_code, material_desc,
          uom, net_qty, num_containers, vendor_code, vendor_batch_no,
          manufacturer, mfg_date, exp_date, next_inspection_date, item_batch_no,
          lr_no, lr_date, transporter_name, vehicle, invoice_no,
          storage_condition, created_at, prepared_by
        `
        )
        .eq("grn_no", grn)
        .order("line_no", { ascending: true });

      if (q.error && /column.*item_batch_no.*does not exist/i.test(q.error.message || "")) {
        q = await supabase
          .from("grn_postings")
          .select(
            `
            grn_no, line_no, kind, item_code, material_code, material_desc,
            uom, net_qty, num_containers, vendor_code, vendor_batch_no,
            manufacturer, mfg_date, exp_date, next_inspection_date, sap_batch_no,
            lr_no, lr_date, transporter_name, vehicle, invoice_no,
            storage_condition, created_at, prepared_by
          `
          )
          .eq("grn_no", grn)
          .order("line_no", { ascending: true });
      }
      if (q.error) throw q.error;

      const rowsRaw = Array.isArray(q.data) ? q.data : [];
      const rows = rowsRaw.map((r) => ({
        ...r,
        item_batch_no: r.item_batch_no ?? r.sap_batch_no ?? null,
      }));

      // 2) Fetch ALL splits for this GRN once
      const sp = await supabase
        .from("vw_grn_line_containers")
        .select("grn_no,line_no,kind,container_index,net_qty")
        .eq("grn_no", grn)
        .order("line_no", { ascending: true })
        .order("container_index", { ascending: true });

      const splitList = Array.isArray(sp.data) ? sp.data : [];
      const keyOf = (ln, k) => `${ln}|${k}`;
      const splitMap = new Map();
      for (const s of splitList) {
        const key = keyOf(s.line_no, s.kind);
        if (!splitMap.has(key)) splitMap.set(key, []);
        splitMap.get(key).push(s);
      }

      // 3) UOM resolution + attach splits + per-display value
      const enriched = await resolveUomRows(rows);
      const withSplits = enriched.map((r) => {
        const key = keyOf(r.line_no, r.kind);
        const splits = splitMap.get(key) || [];
        const fallbackPer =
          r.num_containers && Number(r.num_containers) > 0
            ? Number(r.net_qty || 0) / Number(r.num_containers)
            : null;

        return {
          ...r,
          _splits: splits,
          _per_display: buildPerDisplay(splits, fallbackPer),
        };
      });

      setLines(withSplits);

      // 4) Load print history (non-blocking)
      try {
        const h = await supabase
          .from("label_prints")
          .select("uid, grn_no, line_no, pack_size, container_index, printed_at")
          .eq("grn_no", grn)
          .order("printed_at", { ascending: false })
          .limit(200);
        setHistory(Array.isArray(h.data) ? h.data : []);
      } catch {
        setHistory([]);
      }
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Failed to load GRN");
      setLines([]);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecentGrns();
  }, []);

  const setPack = (key, v) =>
    setPackSizeByKey((prev) => ({ ...prev, [key]: v }));

  // Preview skeleton (not used for split-accurate printing; we use live splits on print)
  const labelsPreview = useMemo(() => {
    const now = new Date().toISOString();
    const out = [];
    for (const r of lines) {
      const n = Number(r.num_containers || 0);
      if (!n || n < 1) continue;

      const key = `${r.grn_no}#${r.line_no}`;
      const packSize = packSizeByKey[key] || "";

      for (let i = 1; i <= n; i++) {
        out.push({
          i,
          n,
          line_no: r.line_no,
          grn_no: r.grn_no,
          grn_date: r.created_at,
          material_code: r.material_code,
          material_desc: r.material_desc || r.material_code,
          vendor_code: r.vendor_code,
          vendor_batch_no: r.vendor_batch_no,
          manufacturer: r.manufacturer,
          mfg_date: toYMD(r.mfg_date),
          exp_date: toYMD(r.exp_date),
          next_inspection_date: toYMD(r.next_inspection_date),
          num_containers: r.num_containers,
          // preview uses total (real split applied during printing)
          total_received: r.net_qty,
          invoice_no: r.invoice_no,
          item_batch_no: r.item_batch_no ?? null,
          prepared_by_display: r.prepared_by || "",
          pack_size: packSize,
          printed_by: userEmail,
          printed_at: now,
          storage_condition: r.storage_condition || STORAGE_DEFAULT,
          uom: r.uom_resolved || r.uom,
          uom_name: r.uom_name || null,
          uom_decimals: r.uom_decimals ?? 3,
          kind: r.kind,
          vehicle: r.vehicle,
          transporter_name: r.transporter_name,
          lr_no: r.lr_no,
          lr_date: toYMD(r.lr_date),
          item_code: r.item_code ?? null,
        });
      }
    }
    return out;
  }, [lines, packSizeByKey, userEmail]);

  /**
   * Print labels.
   * - If `forLine` is provided, print only that line; otherwise print all lines.
   * - Fetch real container splits for each line and build labels with per-container qty.
   * - Insert one row per container into label_prints.
   * - Reprint: if `reuseUIDs` is provided, skip DB insert and reuse those UIDs.
   */
  const printLabels = async (forLine = null, reprint = false, reuseUIDs = null) => {
    if (!grnSelected) return toast.error("Choose a GRN first.");

    // Lines to print
    const targetLines = forLine ? [forLine] : lines;
    if (!targetLines.length) return toast.error("No lines to print.");

    // Prepare window
    const w = window.open("", "_blank", "width=900,height=1200");
    if (!w) return;

    const baseHTML = `
      <html>
        <head>
          <title>Material Labels • ${grnSelected}</title>
          <style>
            @page { size: A6; margin: 6mm; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div id="root"></div>
        </body>
      </html>`;
    w.document.open();
    w.document.write(baseHTML);
    w.document.close();

    const root = w.document.getElementById("root");

    const allInserts = []; // what we'll insert into label_prints (if not reprint)
    let renderedCount = 0;

    // For each line, obtain real splits and render labels
    for (const line of targetLines) {
      const key = `${line.grn_no}#${line.line_no}`;
      const packSize = packSizeByKey[key] || "";
      const dec = line.uom_decimals ?? 3;
      const uomPrint = line.uom_resolved || line.uom || "";

      // 1) Grab per-container splits for this line
      let splits = line._splits || [];
      if (!splits.length) {
        const { data: splitsQ, error: splitsErr } = await supabase
          .from("vw_grn_line_containers")
          .select("container_index, net_qty")
          .eq("grn_no", line.grn_no)
          .eq("line_no", line.line_no)
          .eq("kind", line.kind)
          .order("container_index", { ascending: true });

        if (splitsErr) {
          console.warn("split fetch failed; fallback to equal split", splitsErr);
        }
        splits = Array.isArray(splitsQ) ? splitsQ : [];
      }

      // 2) Fallback to equal split if no splits (old GRNs)
      const containers =
        splits && splits.length
          ? splits
          : Array.from({ length: line.num_containers || 1 }, (_, i) => ({
              container_index: i + 1,
              net_qty:
                Number(line.net_qty || 0) /
                Math.max(1, Number(line.num_containers || 1)),
            }));

      // 3) If reprinting with given UIDs (only valid when printing a single line)
      let uidsForThisLine = [];
      if (Array.isArray(reuseUIDs) && reuseUIDs.length) {
        uidsForThisLine = reuseUIDs.slice(0, containers.length);
      }

      // 4) Render + collect DB rows
      containers.forEach((c, idx) => {
        const i = c.container_index ?? idx + 1;
        const qtyPerContainer = Number(c.net_qty || 0);

        const uid = uidsForThisLine[idx] || uidFor(line.grn_no, line.line_no, i);

        const html = `
          <div style="page-break-after: always; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 12px; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
            <div style="background:${PRINT_HEADER_BLUE};color:#fff;padding:8px 10px;border-radius:6px;font-weight:700;margin-bottom:8px;font-size:13px;">
              Format No. DGX/X/001 Version: 001 Ref SOP No.: SOP/GXT/WH/002 Material Label
            </div>
            <div style="border:1px dashed #94a3b8;border-radius:6px;padding:12px;">
              ${[
                ["Material Code", line.material_code, true],
                ["Material Description", line.material_desc || line.material_code],
                ["Vendor Name Code", line.vendor_code],
                ["Vendor Batch No.", line.vendor_batch_no],
                ["Manufacturer Name Code", line.manufacturer],
                ["Manufacturer Batch No.", line.vendor_batch_no],
                ["Manufacturer Retest Date", fmtDate(line.next_inspection_date)],
                ["Manufacturer Exp.Date", fmtDate(line.exp_date)],
                // IMPORTANT: per-container quantity
                ["Quantity (Net)", `${fmtQty(qtyPerContainer, dec)} ${uomPrint}`],
                ["Invoice No.", line.invoice_no],
                ["Item Batch No.", line.item_batch_no || ""],
                ["Mfg.Date", fmtDate(line.mfg_date)],
                ["GRNNo.Date", `${line.grn_no} / ${fmtDate(line.created_at)}`],
                ["GRNPrepared By Date", `${line.prepared_by || "-"} / ${fmtDate(line.created_at)}`],
                ["Pack Size", packSize],
                ["Printed By Date", `${userEmail} / ${fmtDate(new Date().toISOString())}`],
                ["Container Index", `${i} of ${containers.length}`, true],
              ]
                .map(
                  ([k, v, strong]) =>
                    `<div style="display:flex;gap:12px;line-height:1.3;"><div style="width:220px;color:#1f4bd8;">${k}</div><div style="font-weight:${strong ? 600 : 400};">${v || "-"}</div></div>`
                )
                .join("")}
              <div style="display:flex;gap:12px;margin-top:6px;align-items:center;">
                <div style="width:220px;color:#1f4bd8;">STORAGECONDITION</div>
                <div style="font-weight:600;">${line.storage_condition || STORAGE_DEFAULT}</div>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:12px;">
                <div style="font-size:12px;opacity:0.9;">
                  <div style="font-weight:600;">DigitizerX</div>
                  <div style="font-size:10px;opacity:0.7;">UID: ${uid}</div>
                </div>
                <img src="${QR_URL(uid)}" alt="QR" style="width:96px;height:96px;image-rendering:pixelated;" />
              </div>
            </div>
            <div style="margin-top:8px;font-size:11px;color:#334155;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;">
              This label has been generated electronically and is valid without signature.
            </div>
          </div>
        `;

        const container = w.document.createElement("div");
        container.innerHTML = html;
        root.appendChild(container);
        renderedCount += 1;

        // Build DB row (skip on reprint to avoid UNIQUE conflicts)
        if (!reprint) {
          allInserts.push({
            uid,                                 // deterministic UID
            grn_no: line.grn_no,
            line_no: line.line_no,
            kind: line.kind,
            item_code: line.item_code ?? null,
            material_code: line.material_code,
            material_desc: line.material_desc,
            // Store resolved UOM to keep consistency
            uom: line.uom_resolved || line.uom,
            net_qty: Number(qtyPerContainer.toFixed(dec)), // numeric
            num_containers: containers.length,
            container_index: i,
            pack_size: packSize || null,
            invoice_no: line.invoice_no,
            vendor_code: line.vendor_code,
            vendor_batch_no: line.vendor_batch_no,
            manufacturer: line.manufacturer,
            mfg_date: toYMD(line.mfg_date),
            exp_date: toYMD(line.exp_date),
            next_inspection_date: toYMD(line.next_inspection_date),
            item_batch_no: line.item_batch_no || null,
            lr_no: line.lr_no,
            lr_date: toYMD(line.lr_date),
            transporter_name: line.transporter_name,
            vehicle: line.vehicle,
            storage_condition: line.storage_condition || STORAGE_DEFAULT,
            printed_by: userEmail,
            printed_at: new Date().toISOString(),
          });
        }
      });
    }

    // Insert all labels into DB (only for fresh prints)
    if (!reprint && allInserts.length) {
      try {
        const ins = await supabase
          .from("label_prints")
          // use upsert to be safe against accidental double click; if you prefer strict insert, change to .insert(allInserts)
          .upsert(allInserts, { onConflict: "uid", ignoreDuplicates: false })
          .select("id, uid, grn_no, line_no, container_index, printed_at");

        if (ins.error) {
          const msg =
            ins.error.message +
            (ins.error.details ? ` • ${ins.error.details}` : "") +
            (ins.error.hint ? ` • ${ins.error.hint}` : "");
          toast.error(`Label log failed: ${msg}`);
          console.warn("label_prints upsert failed:", ins.error, allInserts);
        } else {
          toast.success(`Logged ${ins.data?.length || 0} label(s)`);
        }
      } catch (e) {
        toast.error(`Label log error: ${e.message || e}`);
        console.error("label_prints upsert exception:", e);
      }
    }

    // Fire print
    w.focus();
    w.print();
    toast.success(`Rendered ${renderedCount} label(s)`);
  };

  const reprintForLine = async (line) => {
    try {
      const { data, error } = await supabase
        .from("label_prints")
        .select("uid")
        .eq("grn_no", line.grn_no)
        .eq("line_no", line.line_no)
        .order("printed_at", { ascending: false })
        .limit(Number(line.num_containers || 10));
      if (error) throw error;
      const uids = (data || []).map((x) => x.uid);
      if (!uids.length) return toast("No previous labels found; printing fresh.");
      await printLabels(line, true, uids);
    } catch (e) {
      console.error(e);
      toast.error("Reprint failed");
    }
  };

  return (
    <div className="p-3 sm:p-4">
      <div className="rounded-xl overflow-hidden mb-3">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-3 sm:px-4 py-2.5 flex items-center gap-2">
          <PackageSearch className="w-5 h-5 opacity-90" />
          <div className="text-lg font-semibold">Material Label Printing</div>
        </div>

        {/* Controls */}
        <div className="bg-white p-3 border-b">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-6 lg:col-span-5">
              <Label className="text-xs flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-700" />
                Select GRN No.
              </Label>
              <div className="flex gap-2">
                <select
                  className="w-full border rounded-md h-10 px-2"
                  value={grnSelected || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setGrnSelected(v);
                    setPackSizeByKey({});
                    if (v) loadGrnLines(v);
                  }}
                >
                  <option value="">— Choose GRN —</option>
                  {grnList.map((g) => (
                    <option key={g.grn_no} value={g.grn_no}>
                      {g.grn_no} {g.created_at ? `— ${fmtDate(g.created_at)}` : ""}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  title="Refresh"
                  className="h-10 w-10 p-0"
                  onClick={loadRecentGrns}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="col-span-12 md:col-span-6 lg:col-span-7">
              <Label className="text-xs">Quick Actions</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={!lines.length}
                  onClick={() => printLabels(null, false, null)}
                >
                  <Printer className="w-4 h-4 mr-1" />
                  Print ALL Lines
                </Button>

                <Button
                  variant="outline"
                  disabled={!grnSelected}
                  onClick={async () => {
                    try {
                      const res = await supabase
                        .from("label_prints")
                        .select("uid, grn_no, line_no, container_index, printed_at")
                        .eq("grn_no", grnSelected)
                        .order("printed_at", { ascending: false })
                        .limit(50);
                      if (res.error) throw res.error;
                      console.table(res.data);
                      toast(`Found ${res.data?.length || 0} row(s) for ${grnSelected}`);
                    } catch (e) {
                      toast.error(`Read failed: ${e.message || e}`);
                    }
                  }}
                >
                  Show latest in DB
                </Button>

                <Button
                  variant="outline"
                  disabled={!grnSelected}
                  onClick={async () => {
                    try {
                      const { data, error } = await supabase
                        .from("label_prints")
                        .select("*")
                        .eq("grn_no", grnSelected)
                        .order("printed_at", { ascending: false })
                        .limit(200);
                      if (error) throw error;
                      setHistory(Array.isArray(data) ? data : []);
                      toast("Loaded print history");
                    } catch (e) {
                      toast.error(e.message || "History load failed");
                    }
                  }}
                >
                  <History className="w-4 h-4 mr-1" /> Load History
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lines */}
      <Card className="overflow-hidden">
        <div className="px-3 py-2 border-b bg-slate-100 text-sm font-semibold">
          {grnSelected ? `GRN ${grnSelected}` : "Select a GRN to see lines"}
        </div>

        <div className="p-3 overflow-x-auto">
          {!grnSelected ? (
            <div className="text-sm text-slate-600">Pick a GRN above.</div>
          ) : loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={`sk-${i}`} className="h-10 w-full" />
              ))}
            </div>
          ) : !lines.length ? (
            <div className="text-sm text-slate-600">No lines found for this GRN.</div>
          ) : (
            <table className="min-w-[1180px] w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2 text-left">Line</th>
                  <th className="p-2 text-left">Kind</th>
                  <th className="p-2 text-left">Item Code</th>
                  <th className="p-2 text-left">Material</th>
                  <th className="p-2 text-left">UOM</th>
                  <th className="p-2 text-left">Net Qty</th>
                  <th className="p-2 text-left">#Containers</th>
                  <th className="p-2 text-left">Qty/Container</th>
                  <th className="p-2 text-left">Invoice</th>
                  <th className="p-2 text-left">Item Batch</th>
                  <th className="p-2 text-left">Pack Size / Style</th>
                  <th className="p-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((r) => {
                  const key = `${r.grn_no}#${r.line_no}`;
                  const per = r._per_display; // only shows if all splits equal; else “–”
                  const dec = r.uom_decimals ?? 3;
                  return (
                    <tr key={key} className="align-top">
                      <td className="p-2 border-b">{r.line_no}</td>
                      <td className="p-2 border-b">{r.kind}</td>
                      <td className="p-2 border-b">{r.item_code}</td>
                      <td className="p-2 border-b">
                        <div className="font-medium">{r.material_code}</div>
                        <div className="text-xs text-slate-600">
                          {r.material_desc || "-"}
                        </div>
                      </td>
                      <td className="p-2 border-b">
                        <div>{r.uom_resolved || r.uom || "-"}</div>
                        {r.uom_name ? (
                          <div className="text-[11px] text-slate-500">{r.uom_name}</div>
                        ) : null}
                      </td>
                      <td className="p-2 border-b">{fmtQty(r.net_qty, dec)}</td>
                      <td className="p-2 border-b">{r.num_containers || 0}</td>
                      <td className="p-2 border-b">
                        {per == null ? "–" : `${fmtQty(per, dec)}`}
                      </td>
                      <td className="p-2 border-b">{r.invoice_no || "-"}</td>
                      <td className="p-2 border-b">{r.item_batch_no || "-"}</td>
                      <td className="p-2 border-b" style={{ minWidth: 180 }}>
                        <Input
                          className="h-9"
                          placeholder="e.g. 1kg pouch / 25kg bag"
                          value={packSizeByKey[key] || ""}
                          onChange={(e) => setPack(key, e.target.value)}
                        />
                      </td>
                      <td className="p-2 border-b">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() => printLabels(r)}
                            disabled={!r.num_containers || r.num_containers < 1}
                          >
                            <Printer className="w-4 h-4 mr-1" />
                            Print
                          </Button>
                          <Button variant="outline" onClick={() => reprintForLine(r)}>
                            <History className="w-4 h-4 mr-1" />
                            Reprint
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
};

export default LabelPrinting;
