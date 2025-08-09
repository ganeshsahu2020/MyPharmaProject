import { useState } from 'react';

const defaultChecklist = [
  'Visual inspection for damage',
  'Cleanliness of balance, pan, and chamber',
  'Stable placement and environmental conditions',
  'Leveling adjustment',
  'Power stability and warm-up complete',
  'Zero/tare function check',
  'Internal calibration (if applicable)'
];

const Step2_Checklist = ({ checklistData, setChecklistData }) => {
  const handleChange = (index, field, value) => {
    const updated = [...checklistData];
    updated[index][field] = value;
    setChecklistData(updated);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Step 2: Pre-Verification Checklist</h3>

      {checklistData.map((item, index) => (
        <div key={index} className="border p-4 rounded shadow-sm bg-gray-50">
          <div className="mb-2 font-medium">{item.item}</div>

          <div className="flex gap-4 mb-2">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name={`status-${index}`}
                value="OK"
                checked={item.status === 'OK'}
                onChange={() => handleChange(index, 'status', 'OK')}
              />
              OK
            </label>

            <label className="flex items-center gap-1">
              <input
                type="radio"
                name={`status-${index}`}
                value="Not OK"
                checked={item.status === 'Not OK'}
                onChange={() => handleChange(index, 'status', 'Not OK')}
              />
              Not OK
            </label>
          </div>

          <input
            type="text"
            placeholder="Remarks (if any)"
            value={item.remarks}
            onChange={(e) => handleChange(index, 'remarks', e.target.value)}
            className="w-full p-2 border rounded mb-2"
          />

          <input
            type="text"
            placeholder="Initials"
            value={item.initials}
            onChange={(e) => handleChange(index, 'initials', e.target.value)}
            className="w-1/2 p-2 border rounded"
          />
        </div>
      ))}
    </div>
  );
};

export const useChecklistState = () => {
  return defaultChecklist.map((item) => ({
    item,
    status: '',
    remarks: '',
    initials: ''
  }));
};

export default Step2_Checklist;
