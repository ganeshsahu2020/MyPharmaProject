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
    const { data, error } = await supabase.from('weighing_balance_master').select('id, balance_id, description').order('balance_id');
    if (error) toast.error('Error fetching balances');
    else setBalances(data);
  };

  const fetchVerifications = async () => {
    const { data, error } = await supabase
      .from('balance_daily_verification')
      .select('*')
      .eq('balance_uid', selectedBalance)
      .order('std_weight_no');
    if (error) toast.error('Error fetching verifications');
    else setVerifications(data);
  };

  const handleChange = (i, field, value) => {
    const newValue = parseFloat(value) || 0;
    setVerifications(prev => {
      const updated = [...prev];
      updated[i][field] = newValue;
      if (field === 'standard_weight' || field === 'set_limit') {
        updated[i].operating_range_kg = parseFloat((updated[i].standard_weight * (updated[i].set_limit / 100)).toFixed(3));
      }
      updated[i].min_operating_range = parseFloat((updated[i].standard_weight - updated[i].operating_range_kg).toFixed(3));
      updated[i].max_operating_range = parseFloat((updated[i].standard_weight + updated[i].operating_range_kg).toFixed(3));
      return updated;
    });
  };

  const handleSave = async () => {
    const updates = verifications.map(v =>
      supabase.from('balance_daily_verification')
        .update({
          standard_weight: v.standard_weight,
          set_limit: v.set_limit,
          operating_range_kg: v.operating_range_kg,
          min_operating_range: v.min_operating_range,
          max_operating_range: v.max_operating_range
        })
        .eq('id', v.id)
    );
    await Promise.all(updates);
    toast.success('Saved changes');
    fetchVerifications();
  };

  const handleDelete = async (id) => {
    const { error } = await supabase.from('balance_daily_verification').delete().eq('id', id);
    if (error) toast.error('Delete failed');
    else {
      toast.success('Row deleted');
      fetchVerifications();
    }
  };

  const handleAddRow = () => {
    const nextStdNo = verifications.length + 1;
    const newRow = {
      std_weight_no: nextStdNo,
      standard_weight: 0,
      set_limit: 0.01,
      operating_range_kg: 0,
      min_operating_range: 0,
      max_operating_range: 0
    };
    setVerifications(prev => [...prev, newRow]);
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
          {balances.map(b => (
            <option key={b.id} value={b.id}>{b.balance_id} - {b.description}</option>
          ))}
        </select>
        <button
          onClick={handleAddRow}
          className="bg-green-600 text-white px-4 py-2 rounded flex items-center gap-2"
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
              <tr key={i} className="even:bg-gray-50">
                <td className="border p-2 text-center">{v.std_weight_no}</td>
                <td className="border p-2">
                  <input
                    type="number"
                    value={v.standard_weight || ''}
                    onChange={(e) => handleChange(i, 'standard_weight', e.target.value)}
                    className="w-full border p-1 rounded text-center"
                  />
                </td>
                <td className="border p-2">
                  <input
                    type="number"
                    value={v.set_limit || ''}
                    onChange={(e) => handleChange(i, 'set_limit', e.target.value)}
                    className="w-full border p-1 rounded text-center"
                  />
                </td>
                <td className="border p-2 text-center">
  {(v.operating_range_kg ?? (v.standard_weight * (v.set_limit / 100))).toFixed(3)}
</td>
                <td className="border p-2 text-center">{v.min_operating_range?.toFixed(3)}</td>
                <td className="border p-2 text-center">{v.max_operating_range?.toFixed(3)}</td>
                <td className="border p-2 text-center">
                  <button onClick={() => handleDelete(v.id)} className="text-red-600 hover:text-red-800">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
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
