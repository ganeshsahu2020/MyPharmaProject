  import React from 'react';
  import { CheckCircle, XCircle } from 'lucide-react'; // Added icon imports

  const RepeatabilityUncertaintyTest = ({
    repeatabilityTest,
    setRepeatabilityTest,
    uncertaintyTest,
    setUncertaintyTest,
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

    const clearRepeatabilityStandards = () => {
      setRepeatabilityTest(prev => ({
        ...prev,
        standardIds: [],
        standard: '',
        validationMessage: '',
        trials: prev.trials.map(trial => ({ ...trial, min: '', max: '', result: '' }))
      }));
    };

    const updateRepeatabilityStandards = (selectedIds) => {
      const balanceCapacity = selectedBalance ? parseFloat(selectedBalance.capacity) : 0;
      const targetWeight = balanceCapacity * 1.0;
      const selectedWeightsMap = standardWeights.reduce((acc, sw) => {
        acc[sw.id] = parseFloat(sw.capacity);
        return acc;
      }, {});
      const totalSelected = selectedIds.reduce((sum, id) => sum + (selectedWeightsMap[id] || 0), 0);
      const tolerance = 0.05 * targetWeight;
      setRepeatabilityTest(prev => {
        if (Math.abs(totalSelected - targetWeight) <= tolerance) {
          const standard = totalSelected.toFixed(leastCountDigits);
          const min = (totalSelected - 0.001 * totalSelected).toFixed(leastCountDigits);
          const max = (totalSelected + 0.001 * totalSelected).toFixed(leastCountDigits);
          return {
            ...prev,
            standardIds: selectedIds,
            standard,
            trials: prev.trials.map(trial => ({ ...trial, min, max, standard })),
            validationMessage: ''
          };
        } else {
          return {
            ...prev,
            standardIds: selectedIds,
            standard: totalSelected.toFixed(leastCountDigits),
            trials: prev.trials.map(trial => ({ ...trial, min: '', max: '', standard: '' })),
            validationMessage: `Selected weights sum to ${totalSelected.toFixed(leastCountDigits)} kg, which does not match the target ${targetWeight.toFixed(leastCountDigits)} kg (±5%). Please reselect or clear selection.`
          };
        }
      });
    };

    const updateRepeatabilityTest = (index, field, value) => {
      const updated = { ...repeatabilityTest };
      updated.trials[index][field] = value;
      if (field === 'observed') {
        const observed = parseFloat(value);
        const min = parseFloat(updated.trials[index].min);
        const max = parseFloat(updated.trials[index].max);
        updated.trials[index].result = (observed >= min && observed <= max) ? 'Pass' : 'Fail';
      }
      if (updated.trials.every(trial => trial.observed)) {
        const observations = updated.trials.map(trial => parseFloat(trial.observed));
        const mean = observations.reduce((sum, val) => sum + val, 0) / observations.length;
        const variance = observations.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / observations.length;
        const stdDev = Math.sqrt(variance);
        const rsd = (stdDev / mean) * 100;
        updated.mean = mean.toFixed(leastCountDigits);
        updated.standardDeviation = stdDev.toFixed(leastCountDigits);
        updated.rsd = rsd.toFixed(2);
        updated.overallResult = rsd <= 0.05 ? 'Pass' : 'Fail';
        if (updated.mean && updated.standardDeviation) {
          const uncertaintyValue = (2 * stdDev / mean).toFixed(leastCountDigits);
          setUncertaintyTest({
            value: uncertaintyValue,
            result: parseFloat(uncertaintyValue) <= 0.001 ? 'Pass' : 'Fail',
            criteria: 'Calculated from repeatability test (2 × SD / standard weight) ≤ 0.001'
          });
        }
      }
      setRepeatabilityTest(updated);
    };

    return (
      <div className="mt-6 text-center">
        <h3 className="text-xl font-bold mb-4">Repeatability & Uncertainty Test</h3>
        <div className="mb-4">
          <label className="block mb-1" title="Select weights to match the target within ±5% tolerance">
            Select Standard Weights for Repeatability (Target: {selectedBalance ? (parseFloat(selectedBalance.capacity) * 0.5).toFixed(leastCountDigits) : 'N/A'} kg):
          </label>
          <div className="flex flex-col items-center space-y-2">
            <select
              multiple
              value={repeatabilityTest.standardIds}
              onChange={(e) => {
                const selectedOptions = Array.from(e.target.selectedOptions, option => option.value);
                updateRepeatabilityStandards(selectedOptions);
              }}
              className="p-2 border rounded w-64 h-32"
              disabled={isSaved || isVerified}
            >
              <option value="">Select Standards</option>
              {standardWeights.map((sw) => (
                <option
                  key={sw.id}
                  value={sw.id}
                  className={repeatabilityTest.standardIds.includes(sw.id) ? 'bg-blue-100 font-bold' : ''}
                >
                  {sw.standard_weight_id} - {sw.capacity} Kg
                </option>
              ))}
            </select>
            <p className="text-sm">
              Selected Sum: {calculateWeightSum(repeatabilityTest.standardIds)} kg | Target: {(selectedBalance ? parseFloat(selectedBalance.capacity) * 0.5 : 0).toFixed(leastCountDigits)} kg
            </p>
            {repeatabilityTest.validationMessage && (
              <p className="text-red-600">{repeatabilityTest.validationMessage}</p>
            )}
            <button
              onClick={clearRepeatabilityStandards}
              className="bg-red-500 text-white px-4 py-1 rounded hover:bg-red-600"
              disabled={isSaved || isVerified || !repeatabilityTest.standardIds.length}
            >
              Clear Selection
            </button>
            <div className="text-sm mt-2">
              <p>Suggested Combinations:</p>
              {suggestWeightCombinations(parseFloat(selectedBalance?.capacity || 0) * 0.5).map((combo, idx) => (
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
              <th className="border p-2 text-center">Trial</th>
              <th className="border p-2 text-center">Standard Weight</th>
              <th className="border p-2 text-center">Observed Weight</th>
              <th className="border p-2 text-center">Result</th>
            </tr>
          </thead>
          <tbody>
            {repeatabilityTest.trials.map((trial, index) => (
              <tr key={index}>
                <td className="border p-2 text-center">{trial.trial}</td>
                <td className="border p-2 text-center">{trial.standard}</td>
                <td className="border p-2 text-center">
                  <input
                    type="number"
                    value={trial.observed}
                    onChange={(e) => updateRepeatabilityTest(index, 'observed', e.target.value)}
                    className="w-full p-1 border rounded text-center"
                    disabled={isSaved || isVerified || !repeatabilityTest.standard}
                  />
                </td>
                <td className="border p-2 text-center">
                  {trial.result === 'Pass' ? <CheckCircle className="text-green-500 mx-auto" /> : trial.result === 'Fail' ? <XCircle className="text-red-500 mx-auto" /> : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2">Mean: {repeatabilityTest.mean}</p>
        <p>Standard Deviation: {repeatabilityTest.standardDeviation}</p>
        <p>RSD (%): {repeatabilityTest.rsd}</p>
        <p>Overall Result: {repeatabilityTest.overallResult}</p>
        <div className="mt-6">
          <h3 className="text-xl font-bold mb-4">Uncertainty Test</h3>
          <p>Criteria: {uncertaintyTest.criteria}</p>
          <p>Value: {uncertaintyTest.value}</p>
          <p>Result: {uncertaintyTest.result}</p>
        </div>
      </div>
    );
  };

  export default RepeatabilityUncertaintyTest;