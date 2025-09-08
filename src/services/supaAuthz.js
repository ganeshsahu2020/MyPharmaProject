import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

export const useAuthz = () => {
  const [authz, setAuthz] = useState({ loading: true, roles: [] });

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('app_whoami');
      const row = Array.isArray(data) && data.length ? data[0] : null;
      if (error || !row) {
        setAuthz({ loading: false, roles: [] });
        return;
      }
      setAuthz({ ...row, loading: false, roles: row.roles || [] });
    })();
  }, []);

  const hasAny = (need) =>
    Array.isArray(need) && need.some((r) => authz.roles?.includes(r));

  const can = useMemo(
    () => ({
      leave: {
        approve: hasAny(['Super Admin', 'Admin', 'HR', 'Manager']),
        write: hasAny(['Super Admin', 'Admin', 'HR']),
      },
      attendance: {
        write: hasAny(['Super Admin', 'Admin', 'HR', 'Manager']),
      },
    }),
    [authz.roles]
  );

  return { authz, hasAny, can };
};
