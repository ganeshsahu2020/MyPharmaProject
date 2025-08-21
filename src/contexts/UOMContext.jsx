// src/contexts/UOMContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import toast from 'react-hot-toast';

const UOMContext = createContext(null);
export const useUOM = () => useContext(UOMContext) || { uoms: [], loading: false, error: null, reload: () => {} };

export const UOMProvider = ({ children }) => {
  const [uoms, setUoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const normalize = (rows = []) => {
    // Prefer active rows when a status column exists; otherwise pass-through.
    const hasStatus = rows.some(r => Object.prototype.hasOwnProperty.call(r, 'status'));
    const filtered = hasStatus ? rows.filter(r => String(r.status || '').toLowerCase() === 'active') : rows;

    return filtered.map(r => ({
      id: r.id,
      uom_code: r.uom_code,
      // Map to a single friendly name field regardless of schema (uom vs uom_name)
      uom_name: r.uom_name ?? r.uom ?? r.name ?? r.title ?? r.uom_code,
    }));
  };

  const fetchUOMs = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1) Try base table first (most stable). Use '*' to avoid 400 on missing columns.
      let rs = await supabase.from('uom_master').select('*').order('uom_code', { ascending: true });

      // 2) Fallback to view if the table is blocked or missing.
      if (rs.error) {
        rs = await supabase.from('vw_uom_master').select('*').order('uom_code', { ascending: true });
      }
      if (rs.error) throw rs.error;

      setUoms(normalize(rs.data || []));
    } catch (err) {
      setUoms([]);
      setError(err.message || 'Failed to load UOMs');
      toast.error(`❌ Failed to load UOMs: ${err.message || err}`, {
        style: { background: '#fee2e2', color: '#991b1b', fontSize: '14px', borderRadius: '4px', padding: '10px 14px' },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUOMs(); }, []);

  const value = { uoms, loading, error, reload: fetchUOMs };
  return <UOMContext.Provider value={value}>{children}</UOMContext.Provider>;
};
