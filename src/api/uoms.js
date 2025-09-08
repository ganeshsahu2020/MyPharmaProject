// src/api/uoms.js
import { supabase } from '@/utils/supabaseClient';

export async function getUomsByCodes(codes = []) {
  const arr = Array.from(new Set(codes.filter(Boolean)));
  if (!arr.length) return [];
  const { data, error } = await supabase
    .from('uom_master')
    .select('uom_code,uom,uom_name,description')
    .in('uom_code', arr);
  if (error) throw error;
  // normalize to view-like shape in case callers expect code/label/name
  return (data || []).map(r => ({
    code: r.uom_code,
    label: r.uom ?? r.uom_name,
    name: r.uom_name ?? r.uom,
    description: r.description ?? null,
  }));
}
