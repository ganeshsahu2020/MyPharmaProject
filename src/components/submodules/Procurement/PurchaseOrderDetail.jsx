// src/components/submodules/Procurement/PurchaseOrderDetail.jsx
// Purchase Order detail (header + lines only)
// - Loads header from purchase_orders
// - Loads lines from purchase_order_lines (+ materials for code/name/unit)
// - Computes amount if missing, totals in footer
// - No GRN logic or chips; ready for downstream Inbound Gate Entry

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { supabase } from "../../../utils/supabaseClient";
import Button from "../../ui/button";
import { Card } from "../../ui/card";
import { Skeleton } from "../../ui/skeleton";
import {
  ArrowLeft,
  Download,
  Printer,
  UserCircle2,
  RefreshCw,
} from "lucide-react";
import logo from "../../../assets/logo.png";

const COMPANY_NAME = "DigitizerX";

const money3 = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });

const displayName = (p) => {
  const fn = (p?.first_name || "").trim();
  const ln = (p?.last_name || "").trim();
  if (fn || ln) return `${fn} ${ln}`.trim();
  return p?.email || "—";
};

export default function PurchaseOrderDetail() {
  const { poId } = useParams();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [po, setPo] = useState(null);
  const [creatorName, setCreatorName] = useState("—");
  const [lines, setLines] = useState([]);

  const loadAll = async () => {
    if (!poId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Header
      const hdr = await supabase
        .from("purchase_orders")
        .select("*")
        .eq("id", poId)
        .maybeSingle();
      if (hdr.error) throw hdr.error;
      setPo(hdr.data);

      // Creator (profiles)
      if (hdr.data?.created_by) {
        const prof = await supabase
          .from("profiles")
          .select("first_name,last_name,email")
          .eq("id", hdr.data.created_by)
          .maybeSingle();
        if (!prof.error && prof.data) setCreatorName(displayName(prof.data));
      }

      // Lines (+ materials for code/name/unit)
      const pol = await supabase
        .from("purchase_order_lines")
        .select(
          "id,line_no,material_id,description,unit,qty,rate,amount,materials:materials(code,name,unit)"
        )
        .eq("po_id", poId)
        .order("line_no", { ascending: true });

      if (pol.error) throw pol.error;

      const rows =
        (pol.data || []).map((r) => {
          const qty = Number(r.qty || 0);
          const rate = Number(r.rate || 0);
          const amt = r.amount !== null && r.amount !== undefined ? Number(r.amount) : qty * rate;
          return {
            line_id: r.id,
            line_no: r.line_no,
            material_id: r.material_id,
            material_code: r.materials?.code || "",
            description: r.description || r.materials?.name || "",
            unit: r.unit || r.materials?.unit || "",
            qty,
            rate,
            amount: amt,
          };
        }) || [];

      setLines(rows);
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Failed to load PO");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId]);

  // Totals
  const subtotal = useMemo(
    () => lines.reduce((s, r) => s + Number(r.amount || 0), 0),
    [lines]
  );
  const tax = useMemo(() => Number(po?.tax ?? 0), [po]);
  const total = useMemo(
    () => Number(po?.total ?? subtotal + tax),
    [po, subtotal, tax]
  );

  const vendorName = useMemo(
    () => po?.vendor_snapshot?.name || "(vendor not available)",
    [po]
  );
  const vendorEmail = useMemo(() => po?.vendor_snapshot?.email || "", [po]);
  const vendorPhone = useMemo(() => po?.vendor_snapshot?.phone || "", [po]);

  const printPage = () => window.print();

  if (!poId) {
    return (
      <div className="p-4">
        <Card className="p-6">
          Invalid PO URL. Go to{" "}
          <Button variant="link" onClick={() => nav("/procurement/purchase-order")}>
            Purchase Order
          </Button>{" "}
          to create or pick a PO.
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[980px] px-4 md:px-6 py-4 md:py-6 space-y-4 print:py-0">
      {/* Print CSS */}
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          html, body { height: auto; }
          .po-card { box-shadow: none !important; border: none !important; }
          .po-table thead tr { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="flex items-center gap-2 no-print">
        <Button variant="outline" onClick={() => nav(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button variant="outline" onClick={loadAll}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={printPage}>
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
          <Button onClick={printPage}>
            <Download className="w-4 h-4 mr-2" />
            Save PDF
          </Button>
        </div>
      </div>

      <Card className="po-card p-6 print:p-0 print:shadow-none">
        {/* Header Block */}
        <div className="flex items-start gap-4 border-b pb-4">
          <img src={logo} alt="Company Logo" className="w-16 h-16 object-contain" />
          <div>
            <div className="text-xl font-semibold">{COMPANY_NAME}</div>
            <div className="text-sm opacity-70">Purchase Order</div>
            <div className="mt-1 text-xs opacity-70 inline-flex items-center gap-1">
              <UserCircle2 className="w-3 h-3" />
              <span>Created by:</span>
              <span className="font-medium">{creatorName}</span>
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs opacity-70">PO Number</div>
            {loading ? (
              <Skeleton className="h-5 w-40" />
            ) : (
              <div className="font-mono font-semibold break-all">
                {po?.po_no || "—"}
              </div>
            )}
            <div className="text-xs opacity-70 mt-1">Date</div>
            <div>
              {loading ? (
                <Skeleton className="h-4 w-28" />
              ) : (
                new Date(po?.created_at || Date.now()).toLocaleDateString()
              )}
            </div>
          </div>
        </div>

        {/* Meta Row */}
        <div className="grid md:grid-cols-3 gap-6 mt-4">
          <div>
            <div className="text-xs opacity-70">Company</div>
            <div className="font-medium">{COMPANY_NAME}</div>
            <div className="text-xs opacity-70 mt-2">Company Code / FY</div>
            {loading ? (
              <Skeleton className="h-4 w-40" />
            ) : (
              <div className="font-mono">
                {po?.company_code || "—"} / {po?.fy_code || "—"}
              </div>
            )}
          </div>

          <div>
            <div className="text-xs opacity-70">Vendor</div>
            {loading ? (
              <>
                <Skeleton className="h-4 w-52" />
                <Skeleton className="h-4 w-40 mt-1" />
              </>
            ) : (
              <>
                <div className="font-medium">{vendorName}</div>
                {vendorEmail ? <div className="text-sm opacity-70">{vendorEmail}</div> : null}
                {vendorPhone ? <div className="text-sm opacity-70">{vendorPhone}</div> : null}
              </>
            )}
          </div>

          <div className="text-right md:text-left">
            <div className="text-xs opacity-70">Status</div>
            {loading ? (
              <Skeleton className="h-6 w-24 rounded-full" />
            ) : (
              <div className="inline-block rounded-full px-2 py-1 text-xs border">
                {po?.status || "—"}
              </div>
            )}
          </div>
        </div>

        {/* Lines Table */}
        <div className="overflow-x-auto mt-6">
          <table className="po-table table-fixed min-w-full text-sm border">
            <colgroup>
              <col className="w-14" />
              <col />
              <col className="w-24" />
              <col className="w-24" />
              <col className="w-32" />
              <col className="w-32" />
            </colgroup>
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">#</th>
                <th className="text-left p-2">Description</th>
                <th className="text-left p-2">Unit</th>
                <th className="text-right p-2">Qty</th>
                <th className="text-right p-2">Rate</th>
                <th className="text-right p-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="border-t">
                    <td className="p-2">
                      <Skeleton className="h-4 w-6" />
                    </td>
                    <td className="p-2">
                      <Skeleton className="h-4 w-64" />
                    </td>
                    <td className="p-2">
                      <Skeleton className="h-4 w-14" />
                    </td>
                    <td className="p-2 text-right">
                      <Skeleton className="h-4 w-16 ml-auto" />
                    </td>
                    <td className="p-2 text-right">
                      <Skeleton className="h-4 w-20 ml-auto" />
                    </td>
                    <td className="p-2 text-right">
                      <Skeleton className="h-4 w-24 ml-auto" />
                    </td>
                  </tr>
                ))}

              {!loading && lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center opacity-60">
                    No lines
                  </td>
                </tr>
              )}

              {!loading &&
                lines.map((ln) => (
                  <tr key={ln.line_id} className="border-t align-top">
                    <td className="p-2">{ln.line_no}</td>
                    <td className="p-2 break-words">
                      <div className="font-medium">{ln.description}</div>
                      <div className="text-[11px] opacity-70 font-mono">
                        {ln.material_code}
                      </div>
                    </td>
                    <td className="p-2">{ln.unit}</td>
                    <td className="p-2 text-right">
                      {Number(ln.qty || 0).toLocaleString()}
                    </td>
                    <td className="p-2 text-right font-mono">{money3(ln.rate)}</td>
                    <td className="p-2 text-right font-mono">{money3(ln.amount)}</td>
                  </tr>
                ))}
            </tbody>

            <tfoot>
              <tr className="border-t">
                <td colSpan={4}></td>
                <td className="p-2 text-right font-medium">Subtotal</td>
                <td className="p-2 text-right font-mono">
                  {loading ? <Skeleton className="h-4 w-24 ml-auto" /> : money3(subtotal)}
                </td>
              </tr>
              <tr>
                <td colSpan={4}></td>
                <td className="p-2 text-right font-medium">Tax</td>
                <td className="p-2 text-right font-mono">
                  {loading ? <Skeleton className="h-4 w-24 ml-auto" /> : money3(tax)}
                </td>
              </tr>
              <tr>
                <td colSpan={4}></td>
                <td className="p-2 text-right font-semibold">Total</td>
                <td className="p-2 text-right font-bold">
                  {loading ? <Skeleton className="h-4 w-28 ml-auto" /> : money3(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
