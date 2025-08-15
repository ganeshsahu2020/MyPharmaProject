  import React from 'react';
  import { CheckCircle, XCircle } from 'lucide-react'; // Added icon imports

  const LinearityTest = ({
    linearityTest,
    setLinearityTest,
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

    const clearLinearityStandards = (index) => {
      setLinearityTest(prev => {
        const updatedPoints = [...prev.points];
        updatedPoints[index + 1] = {
          ...updatedPoints[index + 1],
          standardIds: [],
          standard: '',
          min: '',
          max: '',
          validationMessage: ''
        };
        return { ...prev, points: updatedPoints };
      });
    };

    const updateLinearityStandards = (index, selectedIds) => {
      const balanceCapacity = selectedBalance ? parseFloat(selectedBalance.capacity) : 0;
      const targetWeight = balanceCapacity * ((index + 1) * 0.25);
      const selectedWeightsMap = standardWeights.reduce((acc, sw) => {
        acc[sw.id] = parseFloat(sw.capacity);
        return acc;
      }, {});
      const totalSelected = selectedIds.reduce((sum, id) => sum + (selectedWeightsMap[id] || 0), 0);
      const tolerance = 0.05 * targetWeight;
      setLinearityTest(prev => {
        const updatedPoints = [...prev.points];
        if (Math.abs(totalSelected - targetWeight) <= tolerance) {
          const standard = totalSelected.toFixed(leastCountDigits);
          const min = (totalSelected - 0.001 * totalSelected).toFixed(leastCountDigits);
          const max = (totalSelected + 0.001 * totalSelected).toFixed(leastCountDigits);
          updatedPoints[index + 1] = {
            ...updatedPoints[index + 1],
            standardIds: selectedIds,
            standard,
            min,
            max,
            validationMessage: ''
          };
        } else {
          updatedPoints[index + 1] = {
            ...updatedPoints[index + 1],
            standardIds: selectedIds,
            standard: totalSelected.toFixed(leastCountDigits),
            min: '',
            max: '',
            validationMessage: `Selected weights sum to ${totalSelected.toFixed(leastCountDigits)} kg, which does not match the target ${targetWeight.toFixed(leastCountDigits)} kg (±5%). Please reselect or clear selection.`
          };
        }
        return {
          ...prev,
          points: updatedPoints,
          overallResult: updatedPoints.every(p => p.result === 'Pass') ? 'Pass' : 'Fail'
        };
      });
    };

    const updateLinearityTest = (index, field, value) => {
      const updated = { ...linearityTest };
      updated.points[index][field] = value;
      if (field === 'observed') {
        const observed = parseFloat(value);
        const min = parseFloat(updated.points[index].min);
        const max = parseFloat(updated.points[index].max);
        updated.points[index].result = (observed >= min && observed <= max) ? 'Pass' : 'Fail';
      }
      updated.overallResult = updated.points.every(point => point.result === 'Pass') ? 'Pass' : 'Fail';
      setLinearityTest(updated);
    };

    return (
      <div className="mt-6 text-center">
        <h3 className="text-xl font-bold mb-4">Linearity Test</h3>
        <p>Criteria: {linearityTest.criteria}</p>
        <div className="mb-4">
          {linearityTest.points.slice(1).map((point, idx) => (
            <div key={idx} className="mb-2">
              <label className="block mb-1" title={`Select weights to match ${point.weight} of balance capacity within ±5% tolerance`}>
                {point.weight} Standard Weights (Target: {selectedBalance ? (parseFloat(selectedBalance.capacity) * ((idx + 1) * 0.25)).toFixed(leastCountDigits) : 'N/A'} kg):
              </label>
              <div className="flex flex-col items-center space-y-2">
                <select
                  multiple
                  value={point.standardIds}
                  onChange={(e) => {
                    const selectedOptions = Array.from(e.target.selectedOptions, option => option.value);
                    updateLinearityStandards(idx, selectedOptions);
                  }}
                  className="p-2 border rounded w-64 h-32"
                  disabled={isSaved || isVerified}
                >
                  <option value="">Select Standards</option>
                  {standardWeights.map((sw) => (
                    <option
                      key={sw.id}
                      value={sw.id}
                      className={point.standardIds.includes(sw.id) ? 'bg-blue-100 font-bold' : ''}
                    >
                      {sw.standard_weight_id} - {sw.capacity} Kg
                    </option>
                  ))}
                </select>
                <p className="text-sm">
                  Selected Sum: {calculateWeightSum(point.standardIds)} kg | Target: {(selectedBalance ? parseFloat(selectedBalance.capacity) * ((idx + 1) * 0.25) : 0).toFixed(leastCountDigits)} kg
                </p>
                {point.validationMessage && (
                  <p className="text-red-600">{point.validationMessage}</p>
                )}
                <button
                  onClick={() => clearLinearityStandards(idx)}
                  className="bg-red-500 text-white px-4 py-1 rounded hover:bg-red-600"
                  disabled={isSaved || isVerified || !point.standardIds.length}
                >
                  Clear Selection
                </button>
                <div className="text-sm mt-2">
                  <p>Suggested Combinations:</p>
                  {suggestWeightCombinations(parseFloat(selectedBalance?.capacity || 0) * ((idx + 1) * 0.25)).map((combo, cIdx) => (
                    <p key={cIdx}>
                      {combo.map(id => {
                        const sw = standardWeights.find(s => s.id === id);
                        return sw ? `${sw.standard_weight_id} (${sw.capacity} kg)` : '';
                      }).join(' + ')}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        <table className="w-full max-w-4xl mx-auto border-collapse border border-gray-300 mt-2">
          <thead>
            <tr>
              <th className="border p-2 text-center">Weight %</th>
              <th className="border p-2 text-center">Standard Weight</th>
              <th className="border p-2 text-center">Observed Weight</th>
              <th className="border p-2 text-center">Min</th>
              <th className="border p-2 text-center">Max</th>
              <th className="border p-2 text-center">Result</th>
            </tr>
          </thead>
          <tbody>
            {linearityTest.points.map((point, index) => (
              <tr key={index}>
                <td className="border p-2 text-center">{point.weight}</td>
                <td className="border p-2 text-center">
                  {point.standardIds.map(id => {
                    const sw = standardWeights.find(s => s.id === id);
                    return sw ? `${sw.standard_weight_id} - ${sw.capacity} Kg` : '';
                  }).join(' + ') || point.standard}
                </td>
                <td className="border p-2 text-center">
                  <input
                    type="number"
                    value={point.observed}
                    onChange={(e) => updateLinearityTest(index, 'observed', e.target.value)}
                    className="w-full p-1 border rounded text-center"
                    disabled={isSaved || isVerified || (index > 0 && !point.standard)}
                  />
                </td>
                <td className="border p-2 text-center">{point.min}</td>
                <td className="border p-2 text-center">{point.max}</td>
                <td className="border p-2 text-center">
                  {point.result === 'Pass' ? <CheckCircle className="text-green-500 mx-auto" /> : point.result === 'Fail' ? <XCircle className="text-red-500 mx-auto" /> : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2">Overall Result: {linearityTest.overallResult}</p>
      </div>
    );
  };

  export default LinearityTest;