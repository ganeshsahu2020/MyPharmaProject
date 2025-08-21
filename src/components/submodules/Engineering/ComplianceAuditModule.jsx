import React,{useEffect,useMemo,useState} from 'react';
import {supabase} from '../../../utils/supabaseClient';
import {Button} from '../../ui/button';
import {ShieldCheck,Plus,Save,Edit3,Search} from 'lucide-react';

const ComplianceAuditModule=()=>{
  const [dev,setDev]=useState([]);
  const [capa,setCapa]=useState([]);
  const [q,setQ]=useState('');
  const [form,setForm]=useState({id:null,dev_code:'',title:'',description:'',status:'Open'});
  const [editing,setEditing]=useState(false);

  const fetchAll=async()=>{
    const d=await supabase.from('deviation').select('*').order('opened_at',{ascending:false});
    if(!d.error){ setDev(d.data||[]); }
    const c=await supabase.from('capa').select('*').order('created_at',{ascending:false});
    if(!c.error){ setCapa(c.data||[]); }
  };
  useEffect(()=>{ fetchAll(); },[]);

  const filtered=useMemo(()=>{
    const s=q.trim().toLowerCase();
    if(!s){ return dev; }
    return dev.filter((r)=>[r.dev_code,r.title,r.status].some((x)=>String(x||'').toLowerCase().includes(s)));
  },[dev,q]);

  const upsert=async()=>{
    try{
      const payload={dev_code:form.dev_code,title:form.title,description:form.description,status:form.status};
      if(form.id){
        const {error}=await supabase.from('deviation').update(payload).eq('id',form.id);
        if(error){ throw error; }
      }else{
        const {error}=await supabase.from('deviation').insert([payload]);
        if(error){ throw error; }
      }
      setEditing(false); setForm({id:null,dev_code:'',title:'',description:'',status:'Open'});
      fetchAll();
    }catch(e){ alert(e.message); }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-semibold flex items-center gap-2"><ShieldCheck size={18}/> Compliance & Audit</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-2.5 opacity-60"/>
            <input className="border rounded pl-7 pr-2 py-1 text-sm" placeholder="Search deviations" value={q} onChange={(e)=>setQ(e.target.value)}/>
          </div>
          <Button onClick={()=>setEditing(true)}><Plus size={16} className="mr-1"/>New Deviation</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded">
          <div className="px-3 py-2 font-semibold bg-gray-50">Deviations</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left">Code</th>
                <th className="p-2 text-left">Title</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r)=>(
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.dev_code}</td>
                  <td className="p-2">{r.title}</td>
                  <td className="p-2">{r.status}</td>
                  <td className="p-2">
                    <Button variant="ghost" onClick={()=>{ setForm({id:r.id,dev_code:r.dev_code,title:r.title,description:r.description||'',status:r.status}); setEditing(true); }}><Edit3 size={16}/></Button>
                  </td>
                </tr>
              ))}
              {!filtered.length&&(<tr><td className="p-2 text-gray-500" colSpan={4}>No deviations.</td></tr>)}
            </tbody>
          </table>
        </div>

        <div className="border rounded">
          <div className="px-3 py-2 font-semibold bg-gray-50">Recent CAPA</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left">Code</th>
                <th className="p-2 text-left">Title</th>
                <th className="p-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {capa.map((r)=>(
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.capa_code}</td>
                  <td className="p-2">{r.title}</td>
                  <td className="p-2">{r.status}</td>
                </tr>
              ))}
              {!capa.length&&(<tr><td className="p-2 text-gray-500" colSpan={3}>No CAPAs.</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {editing&&(
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-40">
          <div className="bg-white rounded-xl p-4 w-full max-w-xl shadow-xl">
            <h3 className="text-lg font-semibold mb-3">{form.id?'Edit':'New'} Deviation</h3>
            <div className="grid grid-cols-2 gap-3">
              <input className="border p-2 rounded" placeholder="Deviation Code" value={form.dev_code} onChange={(e)=>setForm({...form,dev_code:e.target.value})}/>
              <select className="border p-2 rounded" value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})}>
                <option>Open</option><option>Under Review</option><option>Closed</option><option>Canceled</option>
              </select>
              <input className="border p-2 rounded col-span-2" placeholder="Title" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})}/>
              <textarea className="border p-2 rounded col-span-2" placeholder="Description" value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})}/>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={()=>{ setEditing(false); setForm({id:null,dev_code:'',title:'',description:'',status:'Open'}); }}>Cancel</Button>
              <Button onClick={upsert}><Save size={16} className="mr-1"/>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComplianceAuditModule;
