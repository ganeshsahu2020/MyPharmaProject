// src/components/submodules/Procurement/PurchaseOrderIndex.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { supabase } from "../../../utils/supabaseClient";
import { Card } from "../../ui/card";
import Button from '../../ui/button';  // Default import
import Input from '../../ui/Input';  // Correct import statement for default export
import Label from '../../ui/Label';
import { Skeleton } from "../../ui/skeleton";
import { ClipboardCheck, RefreshCw, Search, ExternalLink } from "lucide-react";

/* ---------- constants ---------- */
const COMPANY_CODE = "MFI";
const FY_CODE = "25";
const DEFAULT_STATUSES = new Set(["Open", "Verified"]);
const money3 = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (s) => typeof s === "string" && UUID_RE.test(s);

const PO_NO_RE = /^[A-Z]+\/\d{2}\/PO\/\d{5}$/i; // e.g. MFI/25/PO/00060

/* ---------- small UI helpers ---------- */
const WhiteChip = ({ children }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-white/95 text-blue-800 px-2 py-[2px] text-[11px] border border-white/70 shadow-sm">
    {children}
  </span>
);

export default function PurchaseOrderIndex() {
  const nav = useNavigate();

  /* Open existing PO */
  const [poIdOrNo, setPoIdOrNo] = useState("");

  /* Invoice source for PO-creation */
  const [loading, setLoading] = useState(false);
  const [invOptions, setInvOptions] = useState([]); // [{id,label}]
  const [q, setQ] = useState("");
  const [hideConverted, setHideConverted] = useState(true);
  const [statuses, setStatuses] = useState(DEFAULT_STATUSES);

  /* Single combobox (datalist) */
  const [combo, setCombo] = useState("");
  const [invId, setInvId] = useState("");
  const labelsMap = useMemo(
    () => invOptions.map((o) => ({ id: o.id, label: o.label })),
    [invOptions]
  );

  /* Diagnostics */
  const [total, setTotal] = useState(0);
  const [afterStatus, setAfterStatus] = useState(0);
  const [afterConverted, setAfterConverted] = useState(0);
  const [afterSearch, setAfterSearch] = useState(0);

  /* ---------- load invoices ---------- */
  useEffect(() => {
    loadInvoices();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      loadInvoices();
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, hideConverted, statuses]);

  async function loadInvoices() {
    setLoading(true);
    try {
      const res = await supabase
        .from("invoices")
        .select("id,invoice_no,total,status,created_at,vendor_snapshot,po_id")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (res.error) throw res.error;

      const all = res.data || [];
      setTotal(all.length);

      let rows = all;

      if (statuses.size > 0) {
        rows = rows.filter((r) => statuses.has((r.status || "").trim()));
      }
      setAfterStatus(rows.length);

      const qq = (q || "").toLowerCase();
      if (qq) {
        rows = rows.filter((r) => {
          const v = r?.vendor_snapshot?.name || "";
          return (
            (r.invoice_no || "").toLowerCase().includes(qq) ||
            v.toLowerCase().includes(qq)
          );
        });
      }
      const rowsAfterSearch = rows;

      if (hideConverted) {
        rows = rows.filter((r) => !r.po_id);
      }
      setAfterConverted(rows.length);
      setAfterSearch(rows.length);

      // if all filtered out by hideConverted, relax it once to show the already-converted set
      if (hideConverted && rows.length === 0 && rowsAfterSearch.length > 0) {
        rows = rowsAfterSearch;
        setHideConverted(false);
        toast("All filtered invoices were already converted, showing them.", {
          icon: "ℹ️",
        });
      }

      const opts = rows.map((r) => ({
        id: r.id,
        label: `${r.invoice_no || "—"} · ${
          r.vendor_snapshot?.name || "—"
        } · ${money3(r.total || 0)} (${r.status || "—"})`,
      }));
      setInvOptions(opts);

      if (combo) {
        const m = opts.find((o) => o.label === combo);
        setInvId(m ? m.id : "");
      } else {
        setInvId("");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }

  function toggleStatus(s) {
    setStatuses((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }

  /* ---------- actions ---------- */
  async function openPoByIdOrNo() {
    const raw = (poIdOrNo || "").trim();
    if (!raw) return toast.error("Paste a PO ID or PO number");

    if (isUuid(raw)) return nav(`/procurement/purchase-order/${raw}`);

    if (PO_NO_RE.test(raw)) {
      await toast.promise(
        (async () => {
          const { data, error } = await supabase
            .from("purchase_orders")
            .select("id")
            .eq("po_no", raw)
            .maybeSingle();
          if (error) throw new Error(error.message || "Lookup failed");
          if (!data?.id) throw new Error("PO not found for that number");
          nav(`/procurement/purchase-order/${data.id}`);
        })(),
        {
          loading: "Looking up PO…",
          success: "Opening PO",
          error: (e) => e.message || "Lookup failed",
        }
      );
      return;
    }
    toast.error("Enter a valid UUID or a PO number like MFI/25/PO/00060");
  }

  function onComboChange(val) {
    setCombo(val);
    const found = labelsMap.find((o) => o.label === val);
    setInvId(found ? found.id : "");
  }

  function onComboKeyDown(e) {
    if (e?.key !== "Enter" || invId) return;
    const val = (combo || "").toLowerCase();
    if (!val) return;
    const first = invOptions.find((o) => o.label.toLowerCase().includes(val));
    if (first) {
      setCombo(first.label);
      setInvId(first.id);
    }
  }

  async function createPOFromInvoice() {
    if (!invId) return;
    await toast.promise(
      (async () => {
        const { data, error, status } = await supabase.rpc(
          "create_po_from_invoice",
          {
            inv_id: invId,
            in_company_code: COMPANY_CODE,
            in_fy_code: FY_CODE,
          }
        );
        if (error) {
          console.error("RPC failed", status, error);
          throw new Error(error.details || error.message || "RPC failed");
        }

        const rec = Array.isArray(data) ? data[0] : data || {};
        let newPoId = rec.po_id || rec.id || null;

        if (!newPoId) {
          const probe = await supabase
            .from("invoices")
            .select("po_id")
            .eq("id", invId)
            .maybeSingle();
          if (!probe.error && probe.data?.po_id) {
            newPoId = probe.data.po_id;
          }
        }

        if (!newPoId) throw new Error("PO creation failed: no id returned");
        nav(`/procurement/purchase-order/${newPoId}`);
      })(),
      {
        loading: "Creating PO…",
        success: "PO created",
        error: (e) => e.message || "Failed to create PO",
      }
    );
  }

  /* ---------- UI ---------- */
  const hiddenByStatus = total - afterStatus;
  const hiddenByConverted = afterStatus - afterConverted;
  const hiddenBySearch = afterConverted - afterSearch;

  return (
    <div className="mx-auto max-w-[980px] px-4 md:px-6 py-4 md:py-6 space-y-4">
      {/* Brand header */}
      <div className="rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-4 md:px-6 py-4 flex items-center gap-3">
          <ExternalLink className="w-5 h-5 opacity-90" />
          <div className="text-lg font-semibold">Purchase Order</div>
          <div className="ml-auto hidden sm:flex items-center gap-2">
            <WhiteChip>Blue accents</WhiteChip>
            <WhiteChip>White chips</WhiteChip>
          </div>
        </div>

        <Card className="p-4 md:p-5 rounded-t-none">
          <p className="text-sm opacity-70">
            Open an existing PO, or create one from a verified invoice.
          </p>

          {/* Open existing PO */}
          <div className="mt-3 grid md:grid-cols-[1fr_auto] gap-2 items-center">
            <div className="relative">
              <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600" />
              <Input
                className="pl-9"
                value={poIdOrNo}
                onChange={(e) => setPoIdOrNo(e.target.value)}
                onKeyDown={(e) => {
                  if (e?.key === "Enter") openPoByIdOrNo();
                }}
                placeholder="Paste PO ID (UUID) or PO Number (e.g. MFI/25/PO/00060)"
              />
            </div>
            <Button onClick={openPoByIdOrNo}>Open</Button>
          </div>

          <div className="my-4 h-px bg-gray-200" />

          {/* Filters */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              <label className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={hideConverted}
                  onChange={(e) => setHideConverted(e.target.checked)}
                />
                Hide invoices already converted to a PO
              </label>

              <div className="text-sm flex items-center gap-3 flex-wrap">
                <span className="opacity-70">Statuses:</span>
                {[
                  "Draft",
                  "Open",
                  "Verified",
                  "Approved",
                  "Closed",
                  "Cancelled",
                ].map((s) => (
                  <label key={s} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={statuses.has(s)}
                      onChange={() => toggleStatus(s)}
                    />
                    {s}
                  </label>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStatuses(DEFAULT_STATUSES);
                    setHideConverted(true);
                    setQ("");
                  }}
                >
                  Reset
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600" />
                <Input
                  className="pl-9"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by invoice no. or vendor…"
                />
              </div>
              <Button variant="outline" onClick={loadInvoices} disabled={loading}>
                <RefreshCw className="w-4 h-4 mr-1 text-blue-700" />
                Refresh
              </Button>
            </div>

            <div className="text-xs opacity-70">
              Showing <b>{afterSearch}</b> of <b>{total}</b>
              {hiddenByStatus > 0 ? <> · hidden by status: {hiddenByStatus}</> : null}
              {hiddenByConverted > 0 ? (
                <> · hidden converted: {hiddenByConverted}</>
              ) : null}
              {hiddenBySearch > 0 ? <> · hidden by search: {hiddenBySearch}</> : null}
            </div>
          </div>

          {/* Single searchable combobox (datalist) */}
          <div className="mt-3">
            <Label className="text-xs">Search &amp; pick invoice</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600" />
              <input
                list="inv-datalist"
                className="w-full border rounded px-3 py-2 pl-9"
                placeholder={loading ? "Loading…" : "Start typing invoice or vendor…"}
                value={combo}
                onChange={(e) => onComboChange(e.target.value)}
                onKeyDown={onComboKeyDown}
                disabled={loading || invOptions.length === 0}
              />
            </div>

            <datalist id="inv-datalist">
              {invOptions.map((o) => (
                <option key={o.id} value={o.label} />
              ))}
            </datalist>

            <div className="text-[11px] opacity-60 mt-1">
              Choose a suggestion to bind the invoice. Press Enter to pick the top match.
            </div>

            {/* Skeleton line to hint loading */}
            {loading && (
              <div className="mt-3 space-y-2">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <Button onClick={createPOFromInvoice} disabled={!invId}>
                <ClipboardCheck className="w-4 h-4 mr-2 text-emerald-700" />
                Create PO
              </Button>
              <span className="text-xs opacity-70">
                {invId ? "Selected." : "No invoice selected."}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
