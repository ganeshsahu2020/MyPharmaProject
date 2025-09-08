// ✅ File: src/components/submodules/weighingbalance/DailyVerificationMaster.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import toast from 'react-hot-toast';
import { Box, CheckCircle2, Trash2, PlusCircle } from 'lucide-react';

const DailyVerificationMaster = () => {
  const [verifications, setVerifications] = useState([]);
  const [balances, setBalances] = useState([]);
  const [selectedBalance, setSelectedBalance] = useState('');

  useEffect(() => {
    fetchBalances();
  }, []);

  useEffect(() => {
    if (selectedBalance) fetchVerifications();
  }, [selectedBalance]);

  const fetchBalances = async () => {
    const { data, error } = await supabase
      .from('weighing_balance_master')
      .select('id, balance_id, description')
      .order('balance_id');

    if (error) toast.error('Error fetching balances');
    else setBalances(data || []);
  };

  const fetchVerifications = async () => {
    const { data, error } = await supabase
      .from('balance_daily_verification')
      .select('*')
      .eq('balance_uid', selectedBalance)
      .order('std_weight_no');

    if (error) toast.error('Error fetching verifications');
    else setVerifications(data || []);
  };

  const computeRanges = (row) => {
    const sw = Number(row.standard_weight) || 0;
    const lim = Number(row.set_limit) || 0; // % value; 1 => 1%, 0.01 => 0.01%
    const opr = sw * (lim / 100);
    const min = sw - opr;
    const max = sw + opr;
    return {
      operating_range_kg: parseFloat(opr.toFixed(3)),
      min_operating_range: parseFloat(min.toFixed(3)),
      max_operating_range: parseFloat(max.toFixed(3)),
    };
  };

  const handleChange = (i, field, value) => {
    const newValue = parseFloat(value);
    setVerifications((prev) => {
      const updated = [...prev];
      const row = { ...updated[i], [field]: Number.isFinite(newValue) ? newValue : 0 };
      const ranges = computeRanges(row);
      updated[i] = { ...row, ...ranges };
      return updated;
    });
  };

  const handleSave = async () => {
    if (!selectedBalance) {
      toast.error('Select a balance first');
      return;
    }

    // Ensure computed fields are in-sync before saving
    const rows = verifications.map((v) => ({ ...v, ...computeRanges(v) }));

    const toUpdate = rows.filter((r) => r.id);
    const toInsert = rows
      .filter((r) => !r.id)
      .map((r) => ({
        balance_uid: selectedBalance,
        std_weight_no: r.std_weight_no,
        standard_weight: r.standard_weight,
        set_limit: r.set_limit,
        operating_range_kg: r.operating_range_kg,
        min_operating_range: r.min_operating_range,
        max_operating_range: r.max_operating_range,
      }));

    await toast.promise(
      (async () => {
        // Insert new rows (if any)
        if (toInsert.length) {
          const { error: insErr } = await supabase
            .from('balance_daily_verification')
            .insert(toInsert);
          if (insErr) throw insErr;
        }

        // Update existing rows (one-by-one due to differing values/ids)
        if (toUpdate.length) {
          const updates = toUpdate.map((v) =>
            supabase
              .from('balance_daily_verification')
              .update({
                standard_weight: v.standard_weight,
                set_limit: v.set_limit,
                operating_range_kg: v.operating_range_kg,
                min_operating_range: v.min_operating_range,
                max_operating_range: v.max_operating_range,
              })
              .eq('id', v.id)
          );
          const results = await Promise.all(updates);
          const err = results.find((r) => r.error)?.error;
          if (err) throw err;
        }

        await fetchVerifications();
      })(),
      { loading: 'Saving...', success: 'Saved changes', error: 'Save failed' }
    );
  };

  const handleDelete = async (id) => {
    // If the row isn't saved yet (no id), remove it from UI only
    if (!id) {
      setVerifications((prev) => prev.filter((v) => v.id));
      return;
    }

    const { error } = await supabase
      .from('balance_daily_verification')
      .delete()
      .eq('id', id);

    if (error) toast.error('Delete failed');
    else {
      toast.success('Row deleted');
      fetchVerifications();
    }
  };

  const handleAddRow = () => {
    if (!selectedBalance) {
      toast.error('Select a balance first');
      return;
    }
    const nextStdNo = (verifications[verifications.length - 1]?.std_weight_no || 0) + 1;
    const base = {
      std_weight_no: nextStdNo,
      standard_weight: 0,
      set_limit: 0.01, // percentage (0.01 => 0.01%)
    };
    const ranges = computeRanges(base);
    setVerifications((prev) => [...prev, { ...base, ...ranges }]);
  };

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <Box className="text-blue-600" /> Daily Verification Master
      </h2>

      <div className="mb-4 flex gap-4 items-center">
        <select
          value={selectedBalance}
          onChange={(e) => setSelectedBalance(e.target.value)}
          className="border p-2 rounded w-full sm:w-96 text-center"
        >
          <option value="">Select Balance</option>
          {balances.map((b) => (
            <option key={b.id} value={b.id}>
              {b.balance_id} - {b.description}
            </option>
          ))}
        </select>

        <button
          onClick={handleAddRow}
          className="bg-green-600 text-white px-4 py-2 rounded flex items-center gap-2 disabled:opacity-50"
          disabled={!selectedBalance}
        >
          <PlusCircle size={16} /> Add Row
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border p-2">Std No</th>
              <th className="border p-2">Standard Weight (kg)</th>
              <th className="border p-2">Set Limit (%)</th>
              <th className="border p-2">Operating Range (Kg)</th>
              <th className="border p-2">Min Operating Range</th>
              <th className="border p-2">Max Operating Range</th>
              <th className="border p-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {verifications.map((v, i) => (
              <tr key={v.id ?? `tmp-${i}`} className="even:bg-gray-50">
                <td className="border p-2 text-center">{v.std_weight_no}</td>

                <td className="border p-2">
                  <input
                    type="number"
                    step="0.001"
                    value={v.standard_weight ?? ''}
                    onChange={(e) => handleChange(i, 'standard_weight', e.target.value)}
                    className="w-full border p-1 rounded text-center"
                  />
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    step="0.01"
                    value={v.set_limit ?? ''}
                    onChange={(e) => handleChange(i, 'set_limit', e.target.value)}
                    className="w-full border p-1 rounded text-center"
                  />
                </td>

                <td className="border p-2 text-center">
                  {
                    (
                      ((v.operating_range_kg ?? (v.standard_weight * (v.set_limit / 100))) || 0)
                    ).toFixed(3)
                  }
                </td>
                <td className="border p-2 text-center">{(v.min_operating_range ?? 0).toFixed(3)}</td>
                <td className="border p-2 text-center">{(v.max_operating_range ?? 0).toFixed(3)}</td>

                <td className="border p-2 text-center">
                  <button
                    onClick={() => handleDelete(v.id)}
                    className="text-red-600 hover:text-red-800 inline-flex items-center gap-1"
                    title={v.id ? 'Delete row' : 'Remove unsaved row'}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}

            {verifications.length === 0 && selectedBalance && (
              <tr>
                <td colSpan={7} className="text-center p-4 text-gray-500">
                  No rows yet. Click “Add Row” to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {verifications.length > 0 && (
        <div className="mt-4">
          <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2 rounded">
            <CheckCircle2 size={16} className="inline mr-2" /> Save All Changes
          </button>
        </div>
      )}
    </div>
  );
};

export default DailyVerificationMaster;
