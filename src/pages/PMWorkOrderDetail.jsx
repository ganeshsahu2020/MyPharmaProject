// src/pages/PMWorkOrderDetail.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  ClipboardCopy,
  ShieldCheck,
  Printer,
  ArrowLeft,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { supabase } from "../utils/supabaseClient";
import logo from "../assets/logo.png";

// utils
const isUuid = (v) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v || "")
  );

const pickWO = (raw) => {
  const s = String(raw || "").trim().toUpperCase();
  const m = s.match(/^WO[\s-]*([A-Z0-9]{5,12})$/);
  // returns HR body (e.g., "1SJ44WH") or null
  return m ? m[1] : null;
};

const hrWrap = (body) => `WO-${body}`;
const fmt = (d) => (d ? new Date(d).toLocaleString() : "—");

export default function PMWorkOrderDetail() {
  const { ref } = useParams(); // can be HR (WO-xxxxx) OR a UUID
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [woToken, setWoToken] = useState(null); // UUID token
  const [hrCode, setHrCode] = useState(null); // HR (WO-xxxxx)
  const [data, setData] = useState(null); // unified PM label payload
  const [qrUrl, setQrUrl] = useState(null);

  // Resolve "ref" → UUID token and pull details
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const raw = String(ref || "").trim();
        let token = null;
        let hr = null;

        if (isUuid(raw)) {
          token = raw.toLowerCase();
        } else {
          const body = pickWO(raw);
          if (body) {
            hr = hrWrap(body);
            // Try RPC with p_code first; fallback to p_hr (support both)
            let got = null;
            try {
              const r1 = await supabase.rpc("pm_resolve_wo_hr", {
                p_code: body,
              });
              if (!r1.error && r1.data) got = r1.data;
            } catch {
              /* ignore */
            }
            if (!got) {
              try {
                const r2 = await supabase.rpc("pm_resolve_wo_hr", {
                  p_hr: body,
                });
                if (!r2.error && r2.data) got = r2.data;
              } catch {
                /* ignore */
              }
            }
            if (got && isUuid(got)) token = got.toLowerCase();
          }
        }

        if (!token) {
          toast.error("Unknown Work Order reference");
          setLoading(false);
          return;
        }

        setWoToken(token);

        if (!hr) {
          // derive display HR from token for UI (same scheme as PMScheduler)
          const n = parseInt(token.replace(/-/g, "").slice(0, 8), 16);
          const base36 = n.toString(36).toUpperCase().padStart(5, "0");
          hr = `WO-${base36}`;
        }
        setHrCode(hr);

        // 2) Pull details by token
        let payload = null;

        // 2a) Preferred: pm_lookup_by_token RPC (fast)
        try {
          const { data: rows, error } = await supabase.rpc(
            "pm_lookup_by_token",
            { p_token: token }
          );
          if (!error && rows && rows.length) {
            const r = rows[0];
            payload = {
              wo: r.work_order_uid,
              asset: { code: r.asset_code, name: r.asset_name },
              template: r.template_name,
              freq: r.frequency_code,
              scheduled: r.scheduled_for,
              status: r.status,
              done_by: r.done_by_name || null,
              done_at: r.done_at || null,
              verified_by: r.verified_by_name || null,
              verified_at: r.verified_at || null,
              sop: r.doc_url || null,
            };
          }
        } catch {
          /* ignore; fallback below */
        }

        // 2b) Fallback to views (RLS-friendly if you use them)
        if (!payload) {
          let res = await supabase
            .from("vw_pm_label_ext")
            .select("*")
            .eq("work_order_uid", token)
            .maybeSingle();

          let row = res.data;
          if (res.error || !row) {
            const alt = await supabase
              .from("vw_pm_label")
              .select("*")
              .eq("work_order_uid", token)
              .maybeSingle();
            row = alt.data || null;
          }

          if (row) {
            payload = {
              wo: row.work_order_uid,
              asset: { code: row.asset_code, name: row.asset_name },
              template: row.template_name,
              freq: row.frequency_code,
              scheduled: row.scheduled_for,
              status: row.status,
              done_by: row.done_by_name || null,
              done_at: row.done_at || null,
              verified_by: row.verified_by_name || null,
              verified_at: row.verified_at || null,
              sop: row.doc_url || null,
            };
          }
        }

        if (!payload) {
          toast.error("No data found for this Work Order");
          setLoading(false);
          return;
        }

        setData(payload);

        // 3) Build QR (just the UUID token)
        const q = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
          token
        )}`;
        setQrUrl(q);
      } finally {
        setLoading(false);
      }
    })();
  }, [ref]);

  const onCopy = () => {
    const t = woToken || "";
    if (!t) return;
    navigator.clipboard.writeText(t).then(
      () => toast.success("Token copied"),
      () => toast.error("Copy failed")
    );
  };

  const onPrint = () => {
    if (!data) return;

    const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${hrCode || "Work Order"} — Print</title>
  <style>
    @page { margin: 14mm; }
    body { font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif; color:#0f172a; }
    .header{display:flex;align-items:center;gap:12px;margin-bottom:12px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;}
    .title{font-size:20px;font-weight:800;color:#143C8B}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .card{border:1px solid #e5e7eb;border-radius:12px;padding:10px;}
    .label{color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.04em;}
    .value{font-size:14px;font-weight:600;margin-top:2px;}
    img.qr { height:100px;width:100px;border:1px solid #e5e7eb;border-radius:8px;padding:6px;background:#fff }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logo}" style="height:40px" alt="Logo"/>
    <div style="flex:1">
      <div class="title">${data.asset?.name || ""}</div>
      <div style="font-size:12px;color:#64748b">${data.asset?.code || ""}</div>
    </div>
    ${qrUrl ? `<img class="qr" src="${qrUrl}" alt="QR"/>` : ""}
  </div>

  <div class="grid">
    <div class="card"><div class="label">Work Order</div><div class="value">${hrCode} <span style="color:#64748b;font-weight:400">(${woToken})</span></div></div>
    <div class="card"><div class="label">Status</div><div class="value">${data.status || "—"}</div></div>
    <div class="card"><div class="label">Template</div><div class="value">${data.template || "—"}</div></div>
    <div class="card"><div class="label">Frequency</div><div class="value">${data.freq || "—"}</div></div>
    <div class="card"><div class="label">Scheduled</div><div class="value">${data.scheduled || "—"}</div></div>
    <div class="card"><div class="label">SOP</div><div class="value">${data.sop || "—"}</div></div>

    ${
      data.done_by
        ? `<div class="card"><div class="label">Done By</div><div class="value">${data.done_by}${
            data.done_at ? " @ " + new Date(data.done_at).toLocaleString() : ""
          }</div></div>`
        : ""
    }
    ${
      data.verified_by
        ? `<div class="card"><div class="label">Verified By</div><div class="value">${data.verified_by}${
            data.verified_at
              ? " @ " + new Date(data.verified_at).toLocaleString()
              : ""
          }</div></div>`
        : ""
    }
  </div>

  <script>window.onload=()=>{try{window.print()}catch(e){}}</script>
</body>
</html>`.trim();

    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) {
      toast.error("Popup blocked");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="px-3 py-4 sm:p-6">
      <Toaster position="top-right" />
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => nav(-1)}
          className="mb-3 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div className="rounded-2xl border shadow-sm bg-white/85 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 flex items-center justify-between border-b bg-slate-50">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Logo" className="h-9 w-auto" />
              <div>
                <div className="text-lg sm:text-xl font-extrabold text-blue-800">
                  {loading ? "Loading…" : hrCode || "Work Order"}
                </div>
                <div className="text-xs text-slate-600">
                  {woToken ? <span className="font-mono">{woToken}</span> : "—"}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white hover:bg-slate-50"
                onClick={onCopy}
                disabled={!woToken}
              >
                <ClipboardCopy size={16} />
                Copy token
              </button>
              <button
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white hover:bg-slate-50"
                onClick={onPrint}
                disabled={!data}
              >
                <Printer size={16} />
                Print
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-6">
            {loading ? (
              <div className="text-sm text-slate-600">Loading…</div>
            ) : !data ? (
              <div className="text-sm text-rose-600">
                No data found for this Work Order.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border bg-white p-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    Asset
                  </div>
                  <div className="text-[15px] mt-1 font-semibold">
                    {data.asset?.name || "—"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {data.asset?.code || "—"}
                  </div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    Template
                  </div>
                  <div className="text-[15px] mt-1 font-semibold">
                    {data.template || "—"}
                  </div>
                  <div className="text-xs text-slate-500">
                    Freq: {data.freq || "—"}
                  </div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    Scheduled
                  </div>
                  <div className="text-[15px] mt-1 font-semibold">
                    {data.scheduled || "—"}
                  </div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    Status
                  </div>
                  <div className="text-[15px] mt-1 font-semibold">
                    {data.status || "—"}
                  </div>
                </div>

                {data.sop && (
                  <div className="md:col-span-2 rounded-xl border bg-white p-4">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">
                      SOP / Doc URL
                    </div>
                    <div className="text-[14px] mt-1 break-words">
                      <a
                        href={data.sop}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-700 underline"
                      >
                        {data.sop}
                      </a>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border bg-white p-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    Done
                  </div>
                  <div className="text-[14px] mt-1">
                    {data.done_by ? (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 size={16} className="text-emerald-600" />
                        {data.done_by}{" "}
                        <span className="text-slate-500">
                          • {fmt(data.done_at)}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    Verified
                  </div>
                  <div className="text-[14px] mt-1">
                    {data.verified_by ? (
                      <span className="inline-flex items-center gap-1">
                        <ShieldCheck size={16} className="text-blue-700" />
                        {data.verified_by}{" "}
                        <span className="text-slate-500">
                          • {fmt(data.verified_at)}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>

                <div className="md:col-span-2 rounded-xl border bg-slate-50 p-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                    QR Token
                  </div>
                  <div className="flex items-center gap-4">
                    {qrUrl && (
                      <img
                        src={qrUrl}
                        alt="QR"
                        className="h-28 w-28 rounded border bg-white p-2"
                      />
                    )}
                    <div className="text-xs text-slate-600">
                      This QR encodes only the Work Order token (UUID). Your
                      scanner can use this page or the global scan in the
                      sidebar.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
