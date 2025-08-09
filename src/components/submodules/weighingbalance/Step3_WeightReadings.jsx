import React from 'react';

const capacities = [
  { level: '0.01%', label: '0.01% Capacity' },
  { level: '30%', label: '30% Capacity' },
  { level: '80%', label: '80% Capacity' }
];

const Step3_WeightReadings = ({ weightReadings, setWeightReadings }) => {
  const handleChange = (index, field, value) => {
    const updated = [...weightReadings];
    updated[index][field] = value;
    setWeightReadings(updated);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Step 3: Weight Verification Readings</h3>

      {capacities.map((cap, index) => (
        <div key={index} className="border p-4 rounded bg-gray-50 shadow-sm space-y-2">
          <h4 className="font-medium">{cap.label}</h4>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input
              type="number"
              placeholder="Reading 1"
              value={weightReadings[index].reading_1}
              onChange={(e) => handleChange(index, 'reading_1', e.target.value)}
              className="border p-2 rounded"
            />
            <input
              type="number"
              placeholder="Reading 2"
              value={weightReadings[index].reading_2}
              onChange={(e) => handleChange(index, 'reading_2', e.target.value)}
              className="border p-2 rounded"
            />
            <input
              type="number"
              placeholder="Reading 3"
              value={weightReadings[index].reading_3}
              onChange={(e) => handleChange(index, 'reading_3', e.target.value)}
              className="border p-2 rounded"
            />
            <input
              type="text"
              placeholder="Status (Pass/Fail)"
              value={weightReadings[index].status}
              onChange={(e) => handleChange(index, 'status', e.target.value)}
              className="border p-2 rounded"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <input
              type="number"
              placeholder="Min Limit"
              value={weightReadings[index].min_limit}
              onChange={(e) => handleChange(index, 'min_limit', e.target.value)}
              className="border p-2 rounded"
            />
            <input
              type="number"
              placeholder="Max Limit"
              value={weightReadings[index].max_limit}
              onChange={(e) => handleChange(index, 'max_limit', e.target.value)}
              className="border p-2 rounded"
            />
            <input
              type="number"
              placeholder="Standard Weight (kg)"
              value={weightReadings[index].std_weight}
              onChange={(e) => handleChange(index, 'std_weight', e.target.value)}
              className="border p-2 rounded"
            />
            <input
              type="text"
              placeholder="Remarks (optional)"
              value={weightReadings[index].remarks}
              onChange={(e) => handleChange(index, 'remarks', e.target.value)}
              className="border p-2 rounded"
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// 📦 Default state generator
export const useWeightReadingState = () => {
  return [
    {
      capacity_level: '0.01%',
      reading_1: '',
      reading_2: '',
      reading_3: '',
      std_weight: '',
      min_limit: '',
      max_limit: '',
      status: '',
      remarks: ''
    },
    {
      capacity_level: '30%',
      reading_1: '',
      reading_2: '',
      reading_3: '',
      std_weight: '',
      min_limit: '',
      max_limit: '',
      status: '',
      remarks: ''
    },
    {
      capacity_level: '80%',
      reading_1: '',
      reading_2: '',
      reading_3: '',
      std_weight: '',
      min_limit: '',
      max_limit: '',
      status: '',
      remarks: ''
    }
  ];
};

export default Step3_WeightReadings;
