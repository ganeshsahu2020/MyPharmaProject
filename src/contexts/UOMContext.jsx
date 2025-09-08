// src/contexts/UOMContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../utils/supabaseClient";

const UOMContext = createContext({
  uoms: [],
  loading: true,
  error: null,
  refresh: () => {},
});

export const useUOM = () => useContext(UOMContext);

/** Normalize rows from public.uom_master to a stable shape used in the app */
function normalize(rows = []) {
  return (rows || []).map((r) => ({
    id: r.id ?? r.uom_code,            // fall back to code if id missing
    uom_code: r.uom_code,              // canonical code (e.g., UOM021)
    uom_name: r.uom_name ?? r.uom,     // display name (e.g., Pack)
    uom: r.uom ?? r.uom_name,          // symbol/short label (e.g., pack)
    description: r.description ?? null,
    status: r.status ?? null,          // "Active"/"Inactive" if present
    plant_uid: r.plant_uid ?? null,
    numerator_value: r.numerator_value ?? 1,
    denominator_value: r.denominator_value ?? 1,
  }));
}

export const UOMProvider = ({ children }) => {
  const [uoms, setUoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // Base table only (Option B)
      const rs = await supabase
        .from("uom_master")
        .select(
          "id,plant_uid,uom_code,uom_name,uom,description,numerator_value,denominator_value,status"
        )
        .order("uom_code", { ascending: true });

      if (rs.error) throw rs.error;

      let rows = rs.data || [];

      // If status column exists, prefer only Active
      if (rows.some((r) => Object.prototype.hasOwnProperty.call(r, "status"))) {
        rows = rows.filter(
          (r) => String(r.status || "").toLowerCase() === "active"
        );
      }

      setUoms(normalize(rows));
    } catch (e) {
      console.error("UOM load failed:", e);
      setUoms([]);
      setError(e.message || "Failed to load UOMs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const value = useMemo(
    () => ({ uoms, loading, error, refresh: load }),
    [uoms, loading, error]
  );

  return <UOMContext.Provider value={value}>{children}</UOMContext.Provider>;
};

/* ------------------------------------------------------------------ */
/* Optional helpers (use base table `uom_master`)                      */
/* ------------------------------------------------------------------ */

/** Get many by codes (Option B) */
export async function getUomsByCodes(codes = []) {
  const arr = Array.from(new Set((codes || []).filter(Boolean)));
  if (!arr.length) return [];
  const { data, error } = await supabase
    .from("uom_master")
    .select("uom_code,uom,uom_name,description")
    .in("uom_code", arr);
  if (error) throw error;
  return data || [];
}

/** Get one by code (Option B) */
export async function getUomByCode(code) {
  if (!code) return null;
  const { data, error } = await supabase
    .from("uom_master")
    .select("uom_code,uom,uom_name,description")
    .eq("uom_code", code)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** (If you want view-like shape) map table rows → {code,label,name,description} */
export function toViewShape(rows = []) {
  return (rows || []).map((r) => ({
    code: r.uom_code,
    label: r.uom ?? r.uom_name,
    name: r.uom_name ?? r.uom,
    description: r.description ?? null,
  }));
}
