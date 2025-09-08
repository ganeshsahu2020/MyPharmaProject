// src/components/submodules/hr/HRReports.jsx
import React, { useState } from 'react';
import { Card } from '../../ui/card';
import { Button } from '../../ui/button';

const todayISO = () => new Date().toISOString().slice(0, 10);

const monthStartISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

const HRReports = () => {
  const [range, setRange] = useState({ start: monthStartISO(), end: todayISO() });

  return (
    <div className="p-3 space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold">HR Reports</h2>
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-xs mb-1">Start</label>
              <input
                type="date"
                className="border rounded p-1 h-9 text-sm"
                value={range.start}
                onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs mb-1">End</label>
              <input
                type="date"
                className="border rounded p-1 h-9 text-sm"
                value={range.end}
                onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
              />
            </div>
            <Button variant="outline" disabled>
              Generate
            </Button>
          </div>
        </div>

        <p className="mt-4 text-sm text-gray-600">
          This is a placeholder. Wire to SQL views/RPCs (e.g., payroll summaries, headcount by
          department, attrition, leave utilization) and render tables/exports here.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <div className="border rounded p-3">
            <div className="font-medium">Headcount by Department</div>
            <div className="text-xs text-gray-500 mb-2">
              Range: {range.start} → {range.end}
            </div>
            <Button size="sm" variant="outline" disabled>
              Preview
            </Button>
          </div>

          <div className="border rounded p-3">
            <div className="font-medium">Leave Utilization</div>
            <div className="text-xs text-gray-500 mb-2">
              Range: {range.start} → {range.end}
            </div>
            <Button size="sm" variant="outline" disabled>
              Preview
            </Button>
          </div>

          <div className="border rounded p-3">
            <div className="font-medium">Payroll Summary</div>
            <div className="text-xs text-gray-500 mb-2">
              Range: {range.start} → {range.end}
            </div>
            <Button size="sm" variant="outline" disabled>
              Preview
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default HRReports;
