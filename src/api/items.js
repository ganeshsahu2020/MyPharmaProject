// src/api/items.js
import { supabase } from '../utils/supabaseClient'

/**
 * Look up an item mapping by material code (via public.items view).
 * Returns: { data: [ { id?, item_code, material_code } ], error }
 * - data is [] if not found
 */
export const getItemByMaterial = async (code) => {
  if (!code) return { data: [], error: null }

  const { data, error } = await supabase
    .from('items')
    .select('id,item_code,material_code')
    .eq('material_code', code)
    .limit(1)
    .maybeSingle()

  if (error) return { data: [], error }
  if (!data)  return { data: [], error: null }
  return { data: [data], error: null }
}

/**
 * Minimal list for dropdowns/searches.
 * Returns: { data: Array<{ id?, item_code, material_code }>, error }
 */
export const listItemsMinimal = async () => {
  const { data, error } = await supabase
    .from('items')
    .select('id,item_code,material_code')
    .order('item_code', { ascending: true })

  return { data: data ?? [], error }
}
