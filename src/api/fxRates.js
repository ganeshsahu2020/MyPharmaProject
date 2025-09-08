// src/api/fxRates.js
// Helpers for public.fx_rates (columns: base, quote, rate, valid_from, valid_to)

import { supabase } from '../utils/supabaseClient';

/**
 * Get all rates, ordered by base -> quote -> valid_from.
 */
export async function fetchAllFxRates() {
  const { data, error } = await supabase
    .from('fx_rates')
    .select('base, quote, rate, valid_from, valid_to')
    .order('base', { ascending: true })
    .order('quote', { ascending: true })
    .order('valid_from', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Get distinct currency codes from BOTH base and quote columns (sorted).
 */
export async function fetchDistinctCurrencies() {
  // Two small queries, then merge in JS
  const [bases, quotes] = await Promise.all([
    supabase.from('fx_rates').select('base').not('base', 'is', null),
    supabase.from('fx_rates').select('quote').not('quote', 'is', null),
  ]);

  if (bases.error) throw new Error(bases.error.message);
  if (quotes.error) throw new Error(quotes.error.message);

  const set = new Set([
    ...(bases.data ?? []).map((r) => r.base),
    ...(quotes.data ?? []).map((r) => r.quote),
  ].filter(Boolean));

  return [...set].sort();
}

/**
 * Get the most recent rate for a pair as of a given date (default: now).
 * Returns null if not found.
 */
export async function fetchLatestRate(base, quote, asOf = new Date()) {
  const asIso = new Date(asOf).toISOString();
  const { data, error } = await supabase
    .from('fx_rates')
    .select('base, quote, rate, valid_from, valid_to')
    .eq('base', base)
    .eq('quote', quote)
    .lte('valid_from', asIso)
    .order('valid_from', { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  return (data && data[0]) || null;
}

export default {
  fetchAllFxRates,
  fetchDistinctCurrencies,
  fetchLatestRate,
};
