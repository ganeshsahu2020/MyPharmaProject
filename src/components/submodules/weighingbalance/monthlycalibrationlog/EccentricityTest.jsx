import React from 'react';
import { CheckCircle, XCircle } from 'lucide-react'; // Added icon imports

const EccentricityTest = ({
  eccentricityTest,
  setEccentricityTest,
  standardWeights,
  selectedBalance,
  leastCountDigits,
  isSaved,
  isVerified,
}) => {
  const calculateWeightSum = (standardIds) => {
    return standardIds.reduce((sum, id) => {
      const weight = standardWeights.find(sw => sw.id === id);
      return sum + (weight ? parseFloat(weight.capacity) : 0);
    }, 0).toFixed(leastCountDigits);
  };

  const suggestWeightCombinations = (targetWeight) => {
    const sortedWeights = [...standardWeights].sort((a, b) => parseFloat(b.capacity) - parseFloat(a.capacity));
    const combinations = [];
    const tolerance = 0.05 * targetWeight;

    const findCombinations = (currentSum, index, currentCombo) => {
      if (Math.abs(currentSum - targetWeight) <= tolerance && currentCombo.length > 0) {
        combinations.push([...currentCombo]);
        return;
      }
      if (index >= sortedWeights.length || currentSum > targetWeight + tolerance) {
        return;
      }
      const weight = parseFloat(sortedWeights[index].capacity);
      if (currentSum + weight <= targetWeight + tolerance) {
        findCombinations(currentSum + weight, index + 1, [...currentCombo, sortedWeights[index].id]);
      }
      findCombinations(currentSum, index + 1, currentCombo);
    };

    findCombinations(0, 0, []);
    return combinations.slice(0, 3);
  };

  const clearEccentricityStandards = () => {
    setEccentricityTest(prev => ({
      ...prev,
      standardIds: [],
      standard: '',
      validationMessage: '',
      positions: prev.positions.map(pos => ({ ...pos, min: '', max: '', result: '' }))
    }));
  };

  const updateEccentricityStandards = (selectedIds) => {
    const balanceCapacity = selectedBalance ? parseFloat(selectedBalance.capacity) : 0;
    const targetWeight = balanceCapacity * 1.0;
    const selectedWeightsMap = standardWeights.reduce((acc, sw) => {
      acc[sw.id] = parseFloat(sw.capacity);
      return acc;
    }, {});
    const totalSelected = selectedIds.reduce((sum, id) => sum + (selectedWeightsMap[id] || 0), 0);
    const tolerance = 0.05 * targetWeight;
    setEccentricityTest(prev => {
      if (Math.abs(totalSelected - targetWeight) <= tolerance) {
        const standard = totalSelected.toFixed(leastCountDigits);
        const min = (totalSelected - 0.001 * totalSelected).toFixed(leastCountDigits);
        const max = (totalSelected + 0.001 * totalSelected).toFixed(leastCountDigits);
        return {
          ...prev,
          standardIds: selectedIds,
          standard,
          positions: prev.positions.map(pos => ({ ...pos, min, max })),
          validationMessage: ''
        };
      } else {
        return {
          ...prev,
          standardIds: selectedIds,
          standard: totalSelected.toFixed(leastCountDigits),
          positions: prev.positions.map(pos => ({ ...pos, min: '', max: '' })),
          validationMessage: `Selected weights sum to ${totalSelected.toFixed(leastCountDigits)} kg, which does not match the target ${targetWeight.toFixed(leastCountDigits)} kg (±5%). Please reselect or clear selection.`
        };
      }
    });
  };

  const updateEccentricityTest = (index, field, value) => {
    const updated = { ...eccentricityTest };
    updated.positions[index][field] = value;
    if (field === 'observed') {
      const observed = parseFloat(value) || 0;
      const min = parseFloat(updated.positions[index].min) || 0;
      const max = parseFloat(updated.positions[index].max) || 0;
      updated.positions[index].result = (observed >= min && observed <= max) ? 'Pass' : 'Fail';
    }
    updated.overallResult = updated.positions.every(pos => pos.result === 'Pass') ? 'Pass' : 'Fail';
    setEccentricityTest(updated);
  };

  return (
    <div className="mt-6 text-center">
      <h3 className="text-xl font-bold mb-4">Eccentricity Test</h3>
      <p>Criteria: {eccentricityTest.criteria}</p>
      <div className="mb-4">
        <label className="block mb-1" title="Select weights to match the target within ±5% tolerance (Target: 100% of balance capacity)">
          Select Standard Weights for Eccentricity (Target: {selectedBalance ? (parseFloat(selectedBalance.capacity) * 0.5).toFixed(leastCountDigits) : 'N/A'} kg):
        </label>
        <div className="flex flex-col items-center space-y-2">
          <select
            multiple
            value={eccentricityTest.standardIds}
            onChange={(e) => {
              const selectedOptions = Array.from(e.target.selectedOptions, option => option.value);
              updateEccentricityStandards(selectedOptions);
            }}
            className="p-2 border rounded w-64 h-32"
            disabled={isSaved || isVerified}
          >
            <option value="">Select Standards</option>
            {standardWeights.map((sw) => (
              <option
                key={sw.id}
                value={sw.id}
                className={eccentricityTest.standardIds.includes(sw.id) ? 'bg-blue-100 font-bold' : ''}
              >
                {sw.standard_weight_id} - {sw.capacity} Kg
              </option>
            ))}
          </select>
          <p className="text-sm">
            Selected Sum: {calculateWeightSum(eccentricityTest.standardIds)} kg | Target: {(selectedBalance ? parseFloat(selectedBalance.capacity) * 1.0 : 0).toFixed(leastCountDigits)} kg
          </p>
          {eccentricityTest.validationMessage && (
            <p className="text-red-600">{eccentricityTest.validationMessage}</p>
          )}
          <button
            onClick={clearEccentricityStandards}
            className="bg-red-500 text-white px-4 py-1 rounded hover:bg-red-600"
            disabled={isSaved || isVerified || !eccentricityTest.standardIds.length}
          >
            Clear Selection
          </button>
          <div className="text-sm mt-2">
            <p>Suggested Combinations:</p>
            {suggestWeightCombinations(parseFloat(selectedBalance?.capacity || 0) * 1.0).map((combo, idx) => (
              <p key={idx}>
                {combo.map(id => {
                  const sw = standardWeights.find(s => s.id === id);
                  return sw ? `${sw.standard_weight_id} (${sw.capacity} kg)` : '';
                }).join(' + ')}
              </p>
            ))}
          </div>
        </div>
      </div>
      <table className="w-full max-w-4xl mx-auto border-collapse border border-gray-300 mt-2">
        <thead>
          <tr>
            <th className="border p-2 text-center">Position</th>
            <th className="border p-2 text-center">Observed Weight</th>
            <th className="border p-2 text-center">Min</th>
            <th className="border p-2 text-center">Max</th>
            <th className="border p-2 text-center">Result</th>
          </tr>
        </thead>
        <tbody>
          {eccentricityTest.positions.map((pos, index) => (
            <tr key={index}>
              <td className="border p-2 text-center">{pos.name}</td>
              <td className="border p-2 text-center">
                <input
                  type="number"
                  value={pos.observed}
                  onChange={(e) => updateEccentricityTest(index, 'observed', e.target.value)}
                  className="w-full p-1 border rounded text-center"
                  disabled={isSaved || isVerified || !eccentricityTest.standard}
                />
              </td>
              <td className="border p-2 text-center">{pos.min}</td>
              <td className="border p-2 text-center">{pos.max}</td>
              <td className="border p-2 text-center">
                {pos.result === 'Pass' ? <CheckCircle className="text-green-500 mx-auto" /> : pos.result === 'Fail' ? <XCircle className="text-red-500 mx-auto" /> : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2">Overall Result: {eccentricityTest.overallResult}</p>
    </div>
  );
};

export default EccentricityTest;