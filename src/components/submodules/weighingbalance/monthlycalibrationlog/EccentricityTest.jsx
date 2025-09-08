import React from 'react';
import { CheckCircle, XCircle } from 'lucide-react';

const EccentricityTest = ({
  eccentricityTest,
  setEccentricityTest,
  standardWeights = [],
  selectedBalance,
  leastCountDigits = 3,
  isSaved,
  isVerified,
}) => {
  const calcDigits = Number.isFinite(leastCountDigits) ? leastCountDigits : 3;
  const capacity = selectedBalance ? parseFloat(selectedBalance.capacity) || 0 : 0;
  const TARGET_MULTIPLIER = 1.0; // 100% of capacity for eccentricity
  const targetWeight = capacity * TARGET_MULTIPLIER;

  const calculateWeightSum = (standardIds = []) => {
    const sum = standardIds.reduce((acc, id) => {
      const weight = standardWeights.find((sw) => sw.id === id);
      return acc + (weight ? parseFloat(weight.capacity) || 0 : 0);
    }, 0);
    return sum.toFixed(calcDigits);
  };

  // suggest up to 3 combinations within ±5% tolerance
  const suggestWeightCombinations = (tgt) => {
    const sorted = [...standardWeights].sort(
      (a, b) => (parseFloat(b.capacity) || 0) - (parseFloat(a.capacity) || 0)
    );
    const combinations = [];
    const tolerance = 0.05 * tgt;

    const dfs = (currentSum, index, combo) => {
      if (Math.abs(currentSum - tgt) <= tolerance && combo.length > 0) {
        combinations.push([...combo]);
        return;
      }
      if (index >= sorted.length || currentSum > tgt + tolerance) return;

      const w = parseFloat(sorted[index].capacity) || 0;

      // take
      if (currentSum + w <= tgt + tolerance) {
        dfs(currentSum + w, index + 1, [...combo, sorted[index].id]);
      }
      // skip
      dfs(currentSum, index + 1, combo);
    };

    dfs(0, 0, []);
    return combinations.slice(0, 3);
  };

  const clearEccentricityStandards = () => {
    setEccentricityTest((prev) => ({
      ...prev,
      standardIds: [],
      standard: '',
      validationMessage: '',
      positions: (prev.positions || []).map((pos) => ({
        ...pos,
        min: '',
        max: '',
        result: '',
      })),
    }));
  };

  const updateEccentricityStandards = (selectedIds) => {
    const selectedWeightsMap = standardWeights.reduce((acc, sw) => {
      acc[sw.id] = parseFloat(sw.capacity) || 0;
      return acc;
    }, {});
    const totalSelected = selectedIds.reduce((sum, id) => sum + (selectedWeightsMap[id] || 0), 0);
    const tolerance = 0.05 * targetWeight;

    setEccentricityTest((prev) => {
      if (Math.abs(totalSelected - targetWeight) <= tolerance) {
        // acceptance band for observed values: ±0.1% of the selected standard
        const min = (totalSelected - 0.001 * totalSelected).toFixed(calcDigits);
        const max = (totalSelected + 0.001 * totalSelected).toFixed(calcDigits);
        return {
          ...prev,
          standardIds: selectedIds,
          standard: totalSelected.toFixed(calcDigits),
          positions: (prev.positions || []).map((pos) => ({ ...pos, min, max })),
          validationMessage: '',
        };
      }

      return {
        ...prev,
        standardIds: selectedIds,
        standard: totalSelected.toFixed(calcDigits),
        positions: (prev.positions || []).map((pos) => ({ ...pos, min: '', max: '' })),
        validationMessage: `Selected weights sum to ${totalSelected.toFixed(
          calcDigits
        )} kg, which does not match the target ${targetWeight.toFixed(
          calcDigits
        )} kg (±5%). Please reselect or clear selection.`,
      };
    });
  };

  const updateEccentricityTest = (index, field, value) => {
    setEccentricityTest((prev) => {
      const updated = { ...prev, positions: [...(prev.positions || [])] };
      const pos = { ...(updated.positions[index] || {}) };

      pos[field] = value;

      if (field === 'observed') {
        const observed = parseFloat(value) || 0;
        const min = parseFloat(pos.min);
        const max = parseFloat(pos.max);
        const boundsValid = Number.isFinite(min) && Number.isFinite(max);
        pos.result = boundsValid && observed >= min && observed <= max ? 'Pass' : 'Fail';
      }

      updated.positions[index] = pos;
      updated.overallResult =
        (updated.positions || []).length > 0 &&
        (updated.positions || []).every((p) => p.result === 'Pass')
          ? 'Pass'
          : 'Fail';

      return updated;
    });
  };

  return (
    <div className="mt-6 text-center">
      <h3 className="text-xl font-bold mb-4">Eccentricity Test</h3>
      <p>Criteria: {eccentricityTest?.criteria}</p>

      <div className="mb-4">
        <label
          className="block mb-1"
          title="Select weights to match the target within ±5% tolerance (Target: 100% of balance capacity)"
        >
          Select Standard Weights for Eccentricity (Target:{' '}
          {capacity ? targetWeight.toFixed(calcDigits) : 'N/A'} kg):
        </label>

        <div className="flex flex-col items-center space-y-2">
          <select
            multiple
            value={eccentricityTest?.standardIds || []}
            onChange={(e) => {
              const selectedOptions = Array.from(e.target.selectedOptions, (o) => o.value);
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
                className={
                  (eccentricityTest?.standardIds || []).includes(sw.id)
                    ? 'bg-blue-100 font-bold'
                    : ''
                }
              >
                {sw.standard_weight_id} - {sw.capacity} Kg
              </option>
            ))}
          </select>

          <p className="text-sm">
            Selected Sum: {calculateWeightSum(eccentricityTest?.standardIds || [])} kg | Target:{' '}
            {targetWeight.toFixed(calcDigits)} kg
          </p>

          {eccentricityTest?.validationMessage && (
            <p className="text-red-600">{eccentricityTest.validationMessage}</p>
          )}

          <button
            onClick={clearEccentricityStandards}
            className="bg-red-500 text-white px-4 py-1 rounded hover:bg-red-600"
            disabled={isSaved || isVerified || !(eccentricityTest?.standardIds || []).length}
          >
            Clear Selection
          </button>

          <div className="text-sm mt-2">
            <p>Suggested Combinations:</p>
            {suggestWeightCombinations(targetWeight).map((combo, idx) => (
              <p key={idx}>
                {combo
                  .map((id) => {
                    const sw = standardWeights.find((s) => s.id === id);
                    return sw ? `${sw.standard_weight_id} (${sw.capacity} kg)` : '';
                  })
                  .join(' + ')}
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
          {(eccentricityTest?.positions || []).map((pos, index) => (
            <tr key={index}>
              <td className="border p-2 text-center">{pos.name}</td>
              <td className="border p-2 text-center">
                <input
                  type="number"
                  value={pos.observed}
                  onChange={(e) => updateEccentricityTest(index, 'observed', e.target.value)}
                  className="w-full p-1 border rounded text-center"
                  disabled={isSaved || isVerified || !eccentricityTest?.standard}
                />
              </td>
              <td className="border p-2 text-center">{pos.min}</td>
              <td className="border p-2 text-center">{pos.max}</td>
              <td className="border p-2 text-center">
                {pos.result === 'Pass' ? (
                  <CheckCircle className="text-green-500 mx-auto" />
                ) : pos.result === 'Fail' ? (
                  <XCircle className="text-red-500 mx-auto" />
                ) : (
                  ''
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-2">Overall Result: {eccentricityTest?.overallResult}</p>
    </div>
  );
};

export default EccentricityTest;
