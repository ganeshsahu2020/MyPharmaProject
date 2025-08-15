// src/components/submodules/hr/HRDashboard.jsx
import React,{useEffect,useState} from 'react';
import {supabase} from '../../../utils/supabaseClient';
import {Card} from '../../ui/card';
import {Button} from '../../ui/button';

const startOfMonth=()=>new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().slice(0,10);
const endOfMonth=()=>new Date(new Date().getFullYear(),new Date().getMonth()+1,0).toISOString().slice(0,10);

const HRDashboard=()=>{
  const [range,setRange]=useState({start:startOfMonth(),end:endOfMonth()});
  const [loading,setLoading]=useState(false);
  const [stats,setStats]=useState({
    total_employees:0,
    new_hires:0,
    pending_leaves:0,
    total_payroll:0,
    open_jobs:0,
    new_candidates:0,
    new_applications:0,
    interviews_upcoming:0
  });
  const [leaves,setLeaves]=useState([]);
  const [interviews,setInterviews]=useState([]);

  const pickFirstRow=(data,defaults={})=>{
    if(!data) return defaults;
    if(Array.isArray(data)) return data[0]||defaults;
    return data||defaults;
  };

  const loadStats=async(s=range.start,e=range.end)=>{
    setLoading(true);
    try{
      const {data,error}=await supabase.rpc('hr_dashboard_stats_all',{p_start:s,p_end:e});
      if(error){console.error(error);}
      setStats(pickFirstRow(data,stats));
    }finally{
      setLoading(false);
    }
  };

  const loadLeaves=async(s=range.start,e=range.end)=>{
    const {data,error}=await supabase
      .from('vw_leave_requests')
      .select('*')
      .lte('start_date',e)
      .gte('end_date',s)
      .order('start_date',{ascending:false})
      .limit(100);
    if(error){console.error(error); setLeaves([]); return;}
    setLeaves(Array.isArray(data)?data:[]);
  };

  const loadInterviews=async(s=range.start,e=range.end)=>{
    // Only runs if the view exists and RLS allows it
    const {data,error}=await supabase
      .from('vw_recruit_interviews')
      .select('*')
      .gte('scheduled_at',s)
      .lte('scheduled_at',e)
      .order('scheduled_at',{ascending:true})
      .limit(100);
    if(error){console.warn('Interviews load:',error.message); setInterviews([]); return;}
    setInterviews(Array.isArray(data)?data:[]);
  };

  useEffect(()=>{loadStats(); loadLeaves(); loadInterviews();},[]);
  useEffect(()=>{loadStats(range.start,range.end); loadLeaves(range.start,range.end); loadInterviews(range.start,range.end);},[range.start,range.end]);

  return (
    <div className="p-4 space-y-4">
      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div>
            <label className="block text-xs mb-1">Start</label>
            <input
              type="date"
              className="border rounded p-1 text-sm"
              value={range.start}
              onChange={(e)=>{const s=e.target.value; setRange(r=>({...r,start:s}));}}
            />
          </div>
          <div>
            <label className="block text-xs mb-1">End</label>
            <input
              type="date"
              className="border rounded p-1 text-sm"
              value={range.end}
              onChange={(e)=>{const ed=e.target.value; setRange(r=>({...r,end:ed}));}}
            />
          </div>
          <Button onClick={()=>{loadStats(); loadLeaves(); loadInterviews();}} disabled={loading}>{loading?'Loading...':'Refresh'}</Button>
        </div>

        {/* 8 tiles including Recruitment */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="border rounded p-3">
            <div className="text-xs text-gray-500">Total Employees</div>
            <div className="text-2xl font-bold">{stats.total_employees||0}</div>
          </div>
          <div className="border rounded p-3">
            <div className="text-xs text-gray-500">New Hires</div>
            <div className="text-2xl font-bold">{stats.new_hires||0}</div>
          </div>
          <div className="border rounded p-3">
            <div className="text-xs text-gray-500">Pending Leaves</div>
            <div className="text-2xl font-bold">{stats.pending_leaves||0}</div>
          </div>
          <div className="border rounded p-3">
            <div className="text-xs text-gray-500">Total Payroll</div>
            <div className="text-2xl font-bold">
              {Number(stats.total_payroll||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
            </div>
          </div>

          <div className="border rounded p-3">
            <div className="text-xs text-gray-500">Open Jobs</div>
            <div className="text-2xl font-bold">{stats.open_jobs||0}</div>
          </div>
          <div className="border rounded p-3">
            <div className="text-xs text-gray-500">New Candidates</div>
            <div className="text-2xl font-bold">{stats.new_candidates||0}</div>
          </div>
          <div className="border rounded p-3">
            <div className="text-xs text-gray-500">New Applications</div>
            <div className="text-2xl font-bold">{stats.new_applications||0}</div>
          </div>
          <div className="border rounded p-3">
            <div className="text-xs text-gray-500">Interviews (range)</div>
            <div className="text-2xl font-bold">{stats.interviews_upcoming||0}</div>
          </div>
        </div>
      </Card>

      {/* Leaves overlapping the selected range */}
      <Card className="p-3">
        <div className="text-sm font-semibold mb-2">Recent Leave Requests (overlap in range)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 border text-left">Employee</th>
                <th className="p-2 border text-left">Leave Type</th>
                <th className="p-2 border text-left">Dates</th>
                <th className="p-2 border text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading?(
                <tr><td className="p-3 text-center text-gray-500 border" colSpan={4}>Loading...</td></tr>
              ):leaves.length>0?(
                leaves.map((r)=>(
                  <tr key={r.id}>
                    <td className="p-2 border">{`${r.employee_id} - ${r.first_name||''} ${r.last_name||''}`}</td>
                    <td className="p-2 border">{r.leave_name||'-'}</td>
                    <td className="p-2 border">
                      {new Date(r.start_date).toLocaleDateString()} - {new Date(r.end_date).toLocaleDateString()}
                    </td>
                    <td className="p-2 border">
                      <span className={r.status==='approved'?'text-green-700':r.status==='pending'?'text-amber-600':'text-rose-600'}>
                        {(r.status||'').toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))
              ):(
                <tr><td className="p-3 text-center text-gray-500 border" colSpan={4}>No records</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Upcoming Interviews within the same date range */}
      <Card className="p-3">
        <div className="text-sm font-semibold mb-2">Upcoming Interviews (in range)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 border text-left">When</th>
                <th className="p-2 border text-left">Job</th>
                <th className="p-2 border text-left">Candidate</th>
                <th className="p-2 border text-left">Round</th>
                <th className="p-2 border text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {interviews.length>0?interviews.map((iv)=>(
                <tr key={iv.interview_id}>
                  <td className="p-2 border">{new Date(iv.scheduled_at).toLocaleString()}</td>
                  <td className="p-2 border">{iv.job_title||'-'}</td>
                  <td className="p-2 border">{iv.candidate_name||'-'}</td>
                  <td className="p-2 border">{iv.round_no!=null?`Round ${iv.round_no}`:'-'}</td>
                  <td className="p-2 border">
                    <span className={iv.interview_status==='completed'?'text-green-700':iv.interview_status==='scheduled'?'text-blue-700':'text-amber-700'}>
                      {(iv.interview_status||'').toUpperCase()}
                    </span>
                  </td>
                </tr>
              )):(
                <tr><td className="p-3 text-center text-gray-500 border" colSpan={5}>No interviews</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default HRDashboard;
