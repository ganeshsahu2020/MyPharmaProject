// src/pages/BinDetail.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import { supabase } from "../utils/supabaseClient";
import { Printer, Save, Warehouse } from "lucide-react";
import { getLogoDataURL, makeQR, printHTMLViaIframe } from "../utils/print";
import logo from "../assets/logo.png";

const BinDetail = () => {
  const { plant_id, bin_code } = useParams();

  const [plantUid, setPlantUid] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // Find the plant UID by its human-readable plant_id (case-insensitive)
      const p = await supabase
        .from("plant_master")
        .select("id")
        .ilike("plant_id", plant_id)
        .maybeSingle();

      if (p.error || !p.data) throw new Error("Plant not found");
      setPlantUid(p.data.id);

      // Pull all part_location rows for this plant/bin
      const pl = await supabase
        .from("part_location")
        .select("id, part_uid, qty_on_hand, reorder_point, min_qty, max_qty")
        .eq("plant_uid", p.data.id)
        .eq("bin_code", bin_code);

      if (pl.error) throw pl.error;

      // Fetch part names/codes in one go
      const partIds = [...new Set((pl.data || []).map((r) => r.part_uid))];
      let namesById = {};
      if (partIds.length) {
        const pm = await supabase
          .from("part_master")
          .select("id, part_code, part_name")
          .in("id", partIds);
        if (pm.error) throw pm.error;
        (pm.data || []).forEach((x) => {
          namesById[x.id] = x;
        });
      }

      setRows(
        (pl.data || []).map((r) => ({
          ...r,
          part_code: namesById[r.part_uid]?.part_code || r.part_uid,
          part_name: namesById[r.part_uid]?.part_name || "",
        }))
      );
    } catch (e) {
      console.error(e);
      setRows([]);
      toast.error(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plant_id, bin_code]);

  const save = async () => {
    setSaving(true);
    await toast
      .promise(
        (async () => {
          for (const r of rows) {
            const { error } = await supabase
              .from("part_location")
              .update({
                qty_on_hand: Number(r.qty_on_hand || 0),
                reorder_point: Number(r.reorder_point || 0),
                min_qty: Number(r.min_qty || 0),
                max_qty: Number(r.max_qty || 0),
              })
              .eq("id", r.id);
            if (error) throw error;
          }
        })(),
        {
          loading: "Saving…",
          success: "Saved",
          error: (e) => e?.message || "Save failed",
        }
      )
      .finally(() => setSaving(false));
  };

  const onPrintBinLabel = async () => {
    try {
      const logoURL = await getLogoDataURL(logo);
      const qr = await makeQR(
        JSON.stringify({ type: "bin", plant_id, bin_code })
      );

      const w = 50;
      const h = 38;
      const short = (s) =>
        s && s.length > 8 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;

      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Bin Label</title>
  <style>
    @page { margin: 8mm }
    body { font-family: Arial, Helvetica, sans-serif }
    .card {
      width:${w}mm; height:${h}mm;
      border:1px solid #cbd5e1; border-radius:6px;
      padding:3mm; display:flex; flex-direction:column; justify-content:space-between
    }
    .hdr { display:flex; gap:6px; align-items:center }
    .hdr img { height:10mm }
    .title { font-weight:700; font-size:12px }
    .sub { font-size:10px; color:#374151; margin-top:2px }
    .qr { display:flex; flex-direction:column; align-items:center; justify-content:center }
    .qr img { max-height:18mm; max-width:100% }
    .cap { font-size:10px; color:#6b7280; margin-top:2px }
  </style>
</head>
<body>
  <div class="card">
    <div class="hdr">
      ${logoURL ? `<img src="${logoURL}" alt="logo"/>` : ""}
      <div class="title">DigitizerX — ${plant_id}</div>
    </div>
    <div class="sub">Bin: ${bin_code}</div>
    <div class="qr">
      <img src="${qr}" alt="QR"/>
      <div class="cap">QR • ${short(bin_code)}</div>
    </div>
  </div>
</body>
</html>`;

      printHTMLViaIframe(html);
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Failed to print label");
    }
  };

  return (
    <div className="px-3 py-4 sm:p-6">
      <Toaster position="top-right" />
      <div className="max-w-5xl mx-auto">
        <div className="rounded-2xl border shadow-sm bg-white/80 overflow-hidden">
          <div className="p-4 border-b bg-gradient-to-r from-[#ecf2ff] via-[#f2f7ff] to-[#eefcf6] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#eef2ff] text-[#143C8B] flex items-center justify-center ring-1">
                <Warehouse size={18} />
              </div>
              <div>
                <div className="text-xl font-extrabold text-[#143C8B]">
                  Bin — {plant_id}/{bin_code}
                </div>
                <div className="text-xs text-slate-600">
                  {loading ? "" : `${rows.length} part(s)`}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white hover:bg-slate-50"
                onClick={onPrintBinLabel}
              >
                <Printer size={16} />
                Print Label
              </button>
              <button
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white hover:opacity-95"
                style={{ background: "#0F7A5A" }}
                onClick={save}
                disabled={saving}
              >
                <Save size={16} />
                Save
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-6">
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2 text-left">Part Code</th>
                    <th className="p-2 text-left">Part Name</th>
                    <th className="p-2">Min</th>
                    <th className="p-2">Max</th>
                    <th className="p-2">Reorder</th>
                    <th className="p-2">QOH</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{r.part_code}</td>
                      <td className="p-2">{r.part_name}</td>
                      <td className="p-2">
                        <input
                          className="border rounded p-1 w-20"
                          type="number"
                          value={r.min_qty}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((x) =>
                                x.id === r.id ? { ...x, min_qty: e.target.value } : x
                              )
                            )
                          }
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className="border rounded p-1 w-20"
                          type="number"
                          value={r.max_qty}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((x) =>
                                x.id === r.id ? { ...x, max_qty: e.target.value } : x
                              )
                            )
                          }
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className="border rounded p-1 w-24"
                          type="number"
                          value={r.reorder_point}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((x) =>
                                x.id === r.id
                                  ? { ...x, reorder_point: e.target.value }
                                  : x
                              )
                            )
                          }
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className="border rounded p-1 w-24"
                          type="number"
                          value={r.qty_on_hand}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((x) =>
                                x.id === r.id
                                  ? { ...x, qty_on_hand: e.target.value }
                                  : x
                              )
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td className="p-3 text-slate-500" colSpan={6}>
                        No parts in this bin.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default BinDetail;
