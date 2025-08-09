import { useState, useEffect } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Scale, ClipboardCheck, CalendarCheck } from 'lucide-react';

// 🔹 Child Modules
import WeighingBalanceMaster from './WeighingBalanceMaster';
import DailyVerificationMaster from './DailyVerificationMaster';
import MonthlyCalibrationMaster from './MonthlyCalibrationMaster';

const WeighingModules = () => {
  // ✅ Shared States
  const [balances, setBalances] = useState([]);
  const [selectedBalance, setSelectedBalance] = useState('');

  // ✅ Daily Verification State
  const [dailyRows, setDailyRows] = useState([]);
  const [dailySearch, setDailySearch] = useState('');
  const [dailyLoading, setDailyLoading] = useState(true);

  // ✅ Monthly Calibration State
  const [monthlyRow, setMonthlyRow] = useState(null);
  const [monthlySpecs, setMonthlySpecs] = useState(null);
  const [monthlySearch, setMonthlySearch] = useState('');
  const [monthlyLoading, setMonthlyLoading] = useState(true);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <h2 className="text-xl font-bold mb-4">⚖️ Weighing Modules</h2>

      <Tabs.Root defaultValue="balances">
        <Tabs.List className="flex gap-2 border-b mb-4">
          <Tabs.Trigger value="balances" className="px-4 py-2 flex items-center gap-2">
            <Scale size={18} /> Weighing Balance Master
          </Tabs.Trigger>
          <Tabs.Trigger value="daily" className="px-4 py-2 flex items-center gap-2">
            <ClipboardCheck size={18} /> Daily Verification
          </Tabs.Trigger>
          <Tabs.Trigger value="monthly" className="px-4 py-2 flex items-center gap-2">
            <CalendarCheck size={18} /> Monthly Calibration
          </Tabs.Trigger>
        </Tabs.List>

        {/* ✅ Tab 1: Weighing Balance */}
        <Tabs.Content value="balances">
          <WeighingBalanceMaster />
        </Tabs.Content>

        {/* ✅ Tab 2: Daily Verification */}
        <Tabs.Content value="daily">
          <DailyVerificationMaster
            balances={balances}
            setBalances={setBalances}
            selectedBalance={selectedBalance}
            setSelectedBalance={setSelectedBalance}
            rows={dailyRows}
            setRows={setDailyRows}
            search={dailySearch}
            setSearch={setDailySearch}
            loading={dailyLoading}
            setLoading={setDailyLoading}
          />
        </Tabs.Content>

        {/* ✅ Tab 3: Monthly Calibration */}
        <Tabs.Content value="monthly">
          <MonthlyCalibrationMaster
            balances={balances}
            setBalances={setBalances}
            selectedBalance={selectedBalance}
            setSelectedBalance={setSelectedBalance}
            row={monthlyRow}
            setRow={setMonthlyRow}
            masterSpecs={monthlySpecs}
            setMasterSpecs={setMonthlySpecs}
            search={monthlySearch}
            setSearch={setMonthlySearch}
            loading={monthlyLoading}
            setLoading={setMonthlyLoading}
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
};

export default WeighingModules;
