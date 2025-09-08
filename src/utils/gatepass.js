// src/utils/gatepass.js
// Centralized helpers to read Gate Entry data (by UUID or gate_pass_no)
// and to normalize the PO bundle into convenient arrays.

import { supabase } from "./supabaseClient";

// Extract the first UUID from any messy string like "c8a44c48-...:1"
export const extractUuid = (s) =>
  (String(s || "").match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]) ||
  null;

// Very safe list of columns that should exist in every schema variant
const BASE_FIELDS = [
  "id",
  "gate_pass_no",
  "created_at",
  "lr_no",
  "lr_date",
  "transporter_name",
  "vehicle_no",
  "driver_name",
  "delivery_note",
  "po_bundle_json",
  "created_by",
  "deleted_at", // used for soft-delete checks in UI
].join(",");

/**
 * Load a single inbound gate entry by ID or gate_pass_no (NO optional columns).
 * Tolerant to inputs like "uuid:1" or raw gate pass numbers.
 */
export async function getGateEntry(idOrNo) {
  const raw = String(idOrNo || "").trim();
  const uuid = extractUuid(raw);

  let q = supabase.from("inbound_gate_entries").select(BASE_FIELDS).limit(1);
  q = uuid ? q.eq("id", uuid) : q.eq("gate_pass_no", raw);

  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Gate pass not found");
  return data;
}

/**
 * Optional: read flattened lines if you have a view.
 * Safe to call; returns [] if the view doesn't exist.
 */
export async function getGateEntryLines(idOrNo) {
  try {
    const raw = String(idOrNo || "").trim();
    const uuid = extractUuid(raw);

    let q = supabase.from("vw_gate_pass_bundle").select("*").limit(1000);
    q = uuid ? q.eq("gate_entry_id", uuid) : q.eq("gate_pass_no", raw);

    const { data, error } = await q;
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Derive POS, invoices, materials from a gate entry row (po_bundle_json)
 * into convenient arrays for rendering.
 */
export function deriveBundle(entry) {
  const bundle = Array.isArray(entry?.po_bundle_json) ? entry.po_bundle_json : [];

  // Unique PO numbers
  const pos = [...new Set(bundle.map((b) => b.po_no).filter(Boolean))];

  // Invoice rows per PO (skip empty)
  const invoices = [
    ...new Map(
      bundle
        .map((b) => [
          `${b.po_no || ""}#${b.invoice_no || ""}`,
          { po_no: b.po_no, invoice_no: b.invoice_no, invoice_date: b.po_date },
        ])
        .filter(([k]) => k !== "#")
    ).values(),
  ].filter((x) => x.invoice_no);

  // Materials (flattened)
  const materials = bundle.flatMap((b, idx) => {
    const arr = Array.isArray(b.materials) ? b.materials : [];
    return arr.map((m, i) => ({
      key: `${b.po_no || ""}#${b.invoice_no || ""}#${m.material_code || m.id || `${idx}-${i}`}`,
      po_no: b.po_no || "",
      invoice_no: b.invoice_no || "",
      invoice_date: b.po_date || "",
      material_code: m.material_code || m.materials?.code || "",
      material_desc: m.material_description || m.description || m.materials?.description || "",
      po_qty: m.po_qty || m.qty || "",
      uom: m.uom || m.unit || "",
    }));
  });

  return { pos, invoices, materials };
}
