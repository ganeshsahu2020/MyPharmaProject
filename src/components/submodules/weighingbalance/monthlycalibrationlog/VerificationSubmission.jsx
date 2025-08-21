// src/components/submodules/weighingbalance/monthlycalibrationlog/VerificationSubmission.jsx
import React,{useState} from 'react';
import {Loader2,Save,Trash2,Printer,User} from 'lucide-react';
import toast from 'react-hot-toast';
import logo from '../../../../assets/logo.png'; // adjust if you moved it

const COMPANY_NAME='DigitizerX Pharmaceuticals';

const VerificationSubmission=({
  isSaved=false,
  isVerified=false,
  verifierUserId='',
  setVerifierUserId=()=>{},
  availableUsers=[],
  userManagement=null,
  savePrimary=()=>{},
  verifySecondary=()=>{},
  clearForm=()=>{},
  deleteLog=()=>{},
  printLogbook=()=>{},
  saveLogbookAsPDF=()=>{},
  logId=null,
  showLogbook=false,
  logbookRef={current:null},
  logData=null,
  eccentricityTest={positions:[],standard:'',overallResult:'',criteria:''},
  linearityTest={points:[],overallResult:'',criteria:''},
  repeatabilityTest={trials:[],standard:'',overallResult:'',criteria:''},
  uncertaintyTest={value:'',result:'',criteria:''},
  selectedBalance=null,
  loading=false,
  standardWeights=[],           // currently loaded for the selected weightbox
  standardWeightsForLog=[],     // ← newly passed list fetched by ids from saved log
  leastCountDigits=3
})=>{
  const [errorMessage,setErrorMessage]=useState('');

  // choose the best source to render standards used in the saved log
  const swList=(standardWeightsForLog&&standardWeightsForLog.length)?standardWeightsForLog:standardWeights;

  const renderStandardIds=(ids,fallbackStandard)=>{
    if(!ids||ids.length===0){ return fallbackStandard||'N/A'; }
    const labels=ids.map((id)=>{
      const sw=swList.find((s)=>String(s.id)===String(id));
      return sw?`${sw.standard_weight_id} - ${sw.capacity} Kg`:null;
    }).filter(Boolean);
    // if any id is missing in the lookup, fall back to numeric standard (avoids "N/A + N/A")
    return (labels.length===ids.length)?labels.join(' + '):(fallbackStandard||'N/A');
  };

  const handleVerify=()=>{
    if(!verifierUserId){
      setErrorMessage('Please select a verifier.');
      toast.error('Please select a verifier.');
      return;
    }
    if(!userManagement?.id){
      setErrorMessage('User session invalid. Please log in again.');
      toast.error('User session invalid. Please log in again.');
      return;
    }
    if(verifierUserId===userManagement.id){
      setErrorMessage('You cannot verify your own calibration.');
      toast.error('You cannot verify your own calibration.');
      return;
    }
    setErrorMessage('');
    verifySecondary();
  };

  if(!isSaved||!selectedBalance){
    return (
      <div className="text-center p-4">
        <p className="text-red-600">
          {selectedBalance?'Please save the calibration process before verification.':'Please select a balance and save the calibration process.'}
        </p>
        <button
          onClick={savePrimary}
          className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center justify-center"
          disabled={loading||isSaved}
        >
          {loading?<Loader2 className="animate-spin mr-2"/>:<Save className="mr-2" size={16}/>}
          Save Calibration
        </button>
      </div>
    );
  }

  // Show logbook actions whenever a logbook is visible (not only immediately after verification)
  if(showLogbook&&logData&&selectedBalance){
    return (
      <div className="text-center p-4">
        <style>{`
          @media print{
            .no-print{display:none!important}
            .print-page{padding:0}
            .print-header{position:fixed;top:0;left:0;right:0;background:white}
            .print-body{margin-top:110px}
          }
        `}</style>

        <h3 className="text-xl font-bold mb-1">{isVerified?'Verification Complete':'Logbook Preview'}</h3>
        <p className="mb-4">{isVerified?'Calibration verified.':'Loaded verified logbook for preview/print.'}</p>

        <div className="mt-2 flex flex-wrap gap-3 justify-center no-print">
          <button onClick={printLogbook} className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 flex items-center" disabled={loading}>
            <Printer className="mr-2" size={16}/> Print Logbook
          </button>
          <button onClick={saveLogbookAsPDF} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center" disabled={loading}>
            <Save className="mr-2" size={16}/> Save as PDF
          </button>
          <button onClick={clearForm} className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 flex items-center" disabled={loading}>
            <Trash2 className="mr-2" size={16}/> Clear Form
          </button>
          {logId&&(
            <button onClick={deleteLog} className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 flex items-center" disabled={loading}>
              <Trash2 className="mr-2" size={16}/> Delete Log
            </button>
          )}
        </div>

        {/* Printable Logbook */}
        <div ref={logbookRef} className="mt-6 printable-logbook print-page max-w-4xl mx-auto bg-white p-6 rounded-lg shadow">
          {/* Header with logo + company name */}
          <div className="print-header flex items-center justify-between border-b pb-3 mb-4">
            <div className="flex items-center">
              <img src={logo} alt="Company Logo" className="h-12 w-auto mr-3"/>
              <div>
                <h1 className="text-xl font-bold">{COMPANY_NAME}</h1>
                <p className="text-sm">Monthly Calibration Logbook</p>
              </div>
            </div>
            <div className="text-right text-sm">
              <p><span className="font-semibold">Balance:</span> {selectedBalance.balance_id||'N/A'}</p>
              <p><span className="font-semibold">Date:</span> {logData.created_at?new Date(logData.created_at).toLocaleDateString():'N/A'}</p>
            </div>
          </div>

          {/* Body */}
          <div className="print-body">
            <p className="text-center">Done by: {logData.user?.first_name||'N/A'} {logData.user?.last_name||'N/A'} ({logData.user?.email||'N/A'})</p>
            <p className="text-center">Verified by: {logData.verifier?.first_name||'N/A'} {logData.verifier?.last_name||'N/A'} ({logData.verifier?.email||'N/A'})</p>

            <h4 className="text-lg font-bold mt-4 text-center">Eccentricity Test</h4>
            <p className="text-center">Standard: {eccentricityTest.standard||'N/A'}</p>
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
                {eccentricityTest.positions.map((pos,idx)=>(
                  <tr key={idx}>
                    <td className="border p-2 text-center">{pos.name||'N/A'}</td>
                    <td className="border p-2 text-center">{pos.observed!==''?parseFloat(pos.observed).toFixed(leastCountDigits):'N/A'}</td>
                    <td className="border p-2 text-center">{pos.min!==''?parseFloat(pos.min).toFixed(leastCountDigits):'N/A'}</td>
                    <td className="border p-2 text-center">{pos.max!==''?parseFloat(pos.max).toFixed(leastCountDigits):'N/A'}</td>
                    <td className="border p-2 text-center">{pos.result||'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-center">Overall: {eccentricityTest.overallResult||'N/A'}</p>

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
                {linearityTest.points.map((p,idx)=>(
                  <tr key={idx}>
                    <td className="border p-2 text-center">{p.weight||'N/A'}</td>
                    <td className="border p-2 text-center">
                      {renderStandardIds(p.standardIds,p.standard)}
                    </td>
                    <td className="border p-2 text-center">{p.observed!==''?parseFloat(p.observed).toFixed(leastCountDigits):'N/A'}</td>
                    <td className="border p-2 text-center">{p.min!==''?parseFloat(p.min).toFixed(leastCountDigits):'N/A'}</td>
                    <td className="border p-2 text-center">{p.max!==''?parseFloat(p.max).toFixed(leastCountDigits):'N/A'}</td>
                    <td className="border p-2 text-center">{p.result||'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-center">Overall: {linearityTest.overallResult||'N/A'}</p>

            <h4 className="text-lg font-bold mt-4 text-center">Repeatability Test</h4>
            <p className="text-center">Standard: {renderStandardIds(repeatabilityTest.standardIds,repeatabilityTest.standard)}</p>
            <table className="w-full border-collapse border border-gray-300 mx-auto">
              <thead>
                <tr>
                  <th className="border p-2 text-center">Trial</th>
                  <th className="border p-2 text-center">Observed</th>
                  <th className="border p-2 text-center">Result</th>
                </tr>
              </thead>
              <tbody>
                {repeatabilityTest.trials.map((t,idx)=>(
                  <tr key={idx}>
                    <td className="border p-2 text-center">{t.trial||'N/A'}</td>
                    <td className="border p-2 text-center">{t.observed!==''?parseFloat(t.observed).toFixed(leastCountDigits):'N/A'}</td>
                    <td className="border p-2 text-center">{t.result||'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-center">Mean: {repeatabilityTest.mean!==''?parseFloat(repeatabilityTest.mean).toFixed(leastCountDigits):'N/A'}</p>
            <p className="text-center">SD: {repeatabilityTest.standardDeviation!==''?parseFloat(repeatabilityTest.standardDeviation).toFixed(leastCountDigits):'N/A'}</p>
            <p className="text-center">RSD: {repeatabilityTest.rsd!==''?`${parseFloat(repeatabilityTest.rsd).toFixed(2)}%`:'N/A'}</p>
            <p className="text-center">Overall: {repeatabilityTest.overallResult||'N/A'}</p>

            <h4 className="text-lg font-bold mt-4 text-center">Uncertainty Test</h4>
            <p className="text-center">Value: {uncertaintyTest.value!==''?parseFloat(uncertaintyTest.value).toFixed(leastCountDigits):'N/A'}</p>
            <p className="text-center">Result: {uncertaintyTest.result||'N/A'}</p>
          </div>
        </div>
      </div>
    );
  }

  // verification selector (when logbook not yet visible)
  return (
    <div className="p-4">
      <h3 className="text-xl font-bold mb-4 text-center">Verification Stage</h3>
      <p className="mb-4 text-center">Select a verifier to complete the calibration process.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1">Verifier:</label>
          <select
            value={verifierUserId}
            onChange={(e)=>setVerifierUserId(e.target.value)}
            className="w-full p-2 border rounded"
            disabled={loading||isVerified}
          >
            <option value="">Select Verifier</option>
            {availableUsers.map((u)=>(
              <option key={u.id} value={u.id}>
                {u.first_name} {u.last_name} ({u.email})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block mb-1">&nbsp;</label>
          <button
            onClick={handleVerify}
            className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center justify-center"
            disabled={loading||!verifierUserId||isVerified}
          >
            {loading?<Loader2 className="animate-spin mr-2"/>:<User className="mr-2" size={16}/>}
            Verify Calibration
          </button>
        </div>
      </div>

      {errorMessage&&<p className="mt-4 text-red-600 text-center">{errorMessage}</p>}
      {isVerified&&!showLogbook&&<p className="mt-4 text-green-600 text-center">Verification submitted. Awaiting logbook generation.</p>}
    </div>
  );
};

export default VerificationSubmission;
