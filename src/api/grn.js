// src/api/grn.js
import { supabase } from "../utils/supabaseClient";

/** Return a query builder for grn_postings (handy for callers that want to chain .eq/.order) */
export function listGrnPostings() {
  return supabase.from("grn_postings").select("*");
}

/** Upsert a header by grn_no and return the row */
export async function upsertGrnHeader(row) {
  if (!row?.grn_no) throw new Error("grn_no is required");
  const { data, error } = await supabase
    .from("grn_headers")
    .upsert(row, { onConflict: "grn_no" })
    .select()
    .maybeSingle();
  return { data, error };
}

/**
 * Bulk upsert postings (onConflict: grn_no,line_no).
 * IMPORTANT: Do NOT include "id" in rows here, so conflict target works as intended.
 */
export async function upsertGrnPostings(rows) {
  const payload = Array.isArray(rows) ? rows : [];
  const { data, error } = await supabase
    .from("grn_postings")
    .upsert(payload, { onConflict: "grn_no,line_no" })
    .select();
  return { data, error };
}

/** Delete a single posting line */
export async function deleteGrnPosting(grn_no, line_no) {
  const { data, error } = await supabase
    .from("grn_postings")
    .delete()
    .eq("grn_no", grn_no)
    .eq("line_no", line_no);
  return { data, error };
}

/** Fetch all postings for a specific GRN (used by Posted-preview) */
export async function listLinesByGrn(grn_no) {
  const { data, error } = await supabase
    .from("grn_postings")
    .select("*")
    .eq("grn_no", grn_no)
    .order("line_no", { ascending: true });
  return { data, error };
}
