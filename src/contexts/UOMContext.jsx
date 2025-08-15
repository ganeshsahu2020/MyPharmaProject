import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';

const UOMContext = createContext();

export const UOMProvider = ({ children }) => {
  const auth = useAuth() || {};
  const { user, loading: authLoading } = auth;
  const [uoms, setUoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUOMs = async () => {
      if (authLoading || !user) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.from('uom_master').select('id, uom_code, uom_name').eq('status', 'Active').order('uom_code');
        if (error) throw new Error(`UOM fetch failed: ${error.message}`);
        setUoms(data || []);
      } catch (err) {
        console.error('Error fetching UOMs:', err.message);
        setError(err.message);
        toast.error(`❌ Failed to load UOMs: ${err.message}`, {
          style: {
            background: '#fee2e2',
            color: '#991b1b',
            fontSize: '14px',
            borderRadius: '4px',
            padding: '10px 14px',
          },
        });
      } finally {
        setLoading(false);
      }
    };

    fetchUOMs();
  }, [authLoading, user]);

  return (
    <UOMContext.Provider value={{ uoms, loading, error }}>
      {children}
    </UOMContext.Provider>
  );
};

export const useUOM = () => useContext(UOMContext);