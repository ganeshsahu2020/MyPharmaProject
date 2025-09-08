import React, { useState } from 'react';
import { Loader2, Save, Trash2, Printer, User } from 'lucide-react';
import toast from 'react-hot-toast';

const VerificationSubmission = ({
  isSaved = false,
  isVerified = false,
  verifierUserId = '',
  setVerifierUserId = () => {},
  availableUsers = [],
  userManagement = null,
  savePrimary = () => {},
  verifySecondary = () => {},
  clearForm = () => {},
  deleteLog = () => {},
  printLogbook = () => {},
  saveLogbookAsPDF = () => {},
  logId = null,
  showLogbook = false,
  logbookRef = { current: null },
  logData = null,
  eccentricityTest = { positions: [], standard: '', overallResult: '', criteria: '' },
  linearityTest = { points: [], overallResult: '', criteria: '' },
  repeatabilityTest = { trials: [], standard: '', overallResult: '', criteria: '' },
  uncertaintyTest = { value: '', result: '', criteria: '' },
  selectedBalance = null,
  loading = false,
  standardWeights = [],
}) => {
  const [errorMessage, setErrorMessage] = useState('');

  console.log('VerificationSubmission Props:', {
    isSaved,
    isVerified,
    verifierUserId,
    logId,
    showLogbook,
    selectedBalance,
    loading,
  });

  const handleVerify = () => {
    console.log('Handle Verify:', { verifierUserId, logId, userManagement });
    if (!verifierUserId) {
      setErrorMessage('Please select a verifier.');
      toast.error('Please select a verifier.');
      return;
    }
    if (!userManagement?.id) {
      setErrorMessage('User session invalid. Please log in again.');
      toast.error('User session invalid. Please log in again.');
      return;
    }
    if (verifierUserId === userManagement.id) {
      setErrorMessage('You cannot verify your own calibration.');
      toast.error('You cannot verify your own calibration.');
      return;
    }
    setErrorMessage('');
    verifySecondary();
  };

  if (!isSaved || !selectedBalance) {
    return (
      <div className="text-center p-4">
        <p className="text-red-600">
          {selectedBalance
            ? 'Please save the calibration process before verification.'
            : 'Please select a balance and save the calibration process.'}
        </p>
        <button
          onClick={savePrimary}
          className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center justify-center"
          disabled={loading || isSaved}
        >
          {loading ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2" size={16} />}
          Save Calibration
        </button>
      </div>
    );
  }

  if (isVerified && showLogbook && logData && selectedBalance) {
    console.log('Rendering Logbook:', { logData, selectedBalance, isVerified, showLogbook });
    return (
      <div className="text-center p-4">
        <h3 className="text-xl font-bold mb-4">Verification Complete</h3>
        <p>Calibration for Balance ID: {selectedBalance.balance_id} is verified.</p>
        <div className="mt-6 flex space-x-4 justify-center">
          <button
            onClick={printLogbook}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 flex items-center"
            disabled={loading}
          >
            <Printer className="mr-2" size={16} /> Print Logbook
          </button>
          <button
            onClick={saveLogbookAsPDF}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center"
            disabled={loading}
          >
            <Save className="mr-2" size={16} /> Save as PDF
          </button>
          <button
            onClick={clearForm}
            className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 flex items-center"
            disabled={loading}
          >
            <Trash2 className="mr-2" size={16} /> Clear Form
          </button>
          {logId && (
            <button
              onClick={deleteLog}
              className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 flex items-center"
              disabled={loading}
            >
              <Trash2 className="mr-2" size={16} /> Delete Log
            </button>
          )}
        </div>
        <div ref={logbookRef} className="mt-6 printable-logbook max-w-4xl mx-auto">
          <h3 className="text-xl font-bold mb-4 text-center">Monthly Calibration Logbook</h3>
          <p className="text-center">Balance ID: {selectedBalance.balance_id || 'N/A'}</p>
          <p className="text-center">Date: {logData.created_at ? new Date(logData.created_at).toLocaleDateString() : 'N/A'}</p>
          <p className="text-center">
            Done by: {logData.user?.first_name || 'N/A'} {logData.user?.last_name || 'N/A'} ({logData.user?.email || 'N/A'})
          </p>
          <p className="text-center">
            Verified by: {logData.verifier?.first_name || 'N/A'} {logData.verifier?.last_name || 'N/A'} ({logData.verifier?.email || 'N/A'})
          </p>

          <h4 className="text-lg font-bold mt-4 text-center">Eccentricity Test</h4>
          <p className="text-center">Standard: {eccentricityTest.standard || 'N/A'}</p>
          <table className="w-full border-collapse border border-gray-300 mx-auto">
            <thead>
              <tr>
                <th className="border p-2 text-center">Position</th>
                <th className="border p-2 text-center">Observed</th>
                <th className="border p-2 text-center">Min</th>
                <th className="border p-2 text-center">Max</th>
                <th className="border p-2 text-center">Result</th>
              </tr>
            </thead>
            <tbody>
              {eccentricityTest.positions.map((pos, index) => (
                <tr key={index}>
                  <td className="border p-2 text-center">{pos.name || 'N/A'}</td>
                  <td className="border p-2 text-center">{pos.observed !== '' ? parseFloat(pos.observed).toFixed(leastCountDigits) : 'N/A'}</td>
                  <td className="border p-2 text-center">{pos.min !== '' ? parseFloat(pos.min).toFixed(leastCountDigits) : 'N/A'}</td>
                  <td className="border p-2 text-center">{pos.max !== '' ? parseFloat(pos.max).toFixed(leastCountDigits) : 'N/A'}</td>
                  <td className="border p-2 text-center">{pos.result || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-center">Overall: {eccentricityTest.overallResult || 'N/A'}</p>

          <h4 className="text-lg font-bold mt-4 text-center">Linearity Test</h4>
          <table className="w-full border-collapse border border-gray-300 mx-auto">
            <thead>
              <tr>
                <th className="border p-2 text-center">Weight %</th>
                <th className="border p-2 text-center">Standard</th>
                <th className="border p-2 text-center">Observed</th>
                <th className="border p-2 text-center">Min</th>
                <th className="border p-2 text-center">Max</th>
                <th className="border p-2 text-center">Result</th>
              </tr>
            </thead>
            <tbody>
              {linearityTest.points.map((point, index) => (
                <tr key={index}>
                  <td className="border p-2 text-center">{point.weight || 'N/A'}</td>
                  <td className="border p-2 text-center">
                    {point.standardIds.length > 0
                      ? point.standardIds
                          .map(id => {
                            const sw = standardWeights.find(s => s.id === id);
                            return sw ? `${sw.standard_weight_id} - ${sw.capacity} Kg` : 'N/A';
                          })
                          .join(' + ')
                      : point.standard || 'N/A'}
                  </td>
                  <td className="border p-2 text-center">{point.observed !== '' ? parseFloat(point.observed).toFixed(leastCountDigits) : 'N/A'}</td>
                  <td className="border p-2 text-center">{point.min !== '' ? parseFloat(point.min).toFixed(leastCountDigits) : 'N/A'}</td>
                  <td className="border p-2 text-center">{point.max !== '' ? parseFloat(point.max).toFixed(leastCountDigits) : 'N/A'}</td>
                  <td className="border p-2 text-center">{point.result || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-center">Overall: {linearityTest.overallResult || 'N/A'}</p>

          <h4 className="text-lg font-bold mt-4 text-center">Repeatability Test</h4>
          <p className="text-center">Standard: {repeatabilityTest.standard || 'N/A'}</p>
          <table className="w-full border-collapse border border-gray-300 mx-auto">
            <thead>
              <tr>
                <th className="border p-2 text-center">Trial</th>
                <th className="border p-2 text-center">Observed</th>
                <th className="border p-2 text-center">Result</th>
              </tr>
            </thead>
            <tbody>
              {repeatabilityTest.trials.map((trial, index) => (
                <tr key={index}>
                  <td className="border p-2 text-center">{trial.trial || 'N/A'}</td>
                  <td className="border p-2 text-center">{trial.observed !== '' ? parseFloat(trial.observed).toFixed(leastCountDigits) : 'N/A'}</td>
                  <td className="border p-2 text-center">{trial.result || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-center">Mean: {repeatabilityTest.mean !== '' ? parseFloat(repeatabilityTest.mean).toFixed(leastCountDigits) : 'N/A'}</p>
          <p className="text-center">SD: {repeatabilityTest.standardDeviation !== '' ? parseFloat(repeatabilityTest.standardDeviation).toFixed(leastCountDigits) : 'N/A'}</p>
          <p className="text-center">RSD: {repeatabilityTest.rsd !== '' ? `${parseFloat(repeatabilityTest.rsd).toFixed(2)}%` : 'N/A'}</p>
          <p className="text-center">Overall: {repeatabilityTest.overallResult || 'N/A'}</p>

          <h4 className="text-lg font-bold mt-4 text-center">Uncertainty Test</h4>
          <p className="text-center">Value: {uncertaintyTest.value !== '' ? parseFloat(uncertaintyTest.value).toFixed(leastCountDigits) : 'N/A'}</p>
          <p className="text-center">Result: {uncertaintyTest.result || 'N/A'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h3 className="text-xl font-bold mb-4 text-center">Verification Stage</h3>
      <p className="mb-4 text-center">Select a verifier to complete the calibration process.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1">Verifier:</label>
          <select
            value={verifierUserId}
            onChange={(e) => setVerifierUserId(e.target.value)}
            className="w-full p-2 border rounded"
            disabled={loading || isVerified}
          >
            <option value="">Select Verifier</option>
            {availableUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.first_name} {user.last_name} ({user.email})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block mb-1">&nbsp;</label>
          <button
            onClick={handleVerify}
            className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center justify-center"
            disabled={loading || !verifierUserId || isVerified}
          >
            {loading ? <Loader2 className="animate-spin mr-2" /> : <User className="mr-2" size={16} />}
            Verify Calibration
          </button>
        </div>
      </div>
      {errorMessage && <p className="mt-4 text-red-600 text-center">{errorMessage}</p>}
      {isVerified && !showLogbook && (
        <p className="mt-4 text-green-600 text-center">Verification submitted. Awaiting logbook generation.</p>
      )}
    </div>
  );
};

export default VerificationSubmission;