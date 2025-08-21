// src/components/submodules/Engineering/AssetManagement.jsx
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from '../../../utils/supabaseClient';
import {Button} from '../../ui/button';
import toast,{Toaster} from 'react-hot-toast';

import {
  Search,Plus,Upload,Save,Edit3,ShieldCheck,Package,AlertTriangle,Database,RefreshCw,
  Trash2,Info,X,Printer,FileDown,Download,CheckSquare,Square,QrCode,
  Tag,Layers,CalendarCheck,CalendarClock,Building2,Factory,Briefcase,Grid3X3,Copy,ExternalLink
} from 'lucide-react';

import QRCode from 'qrcode';
import logo from '../../../assets/logo.png';
import {openQRForRow} from '../../../utils/qr'; // ← keep open action; labels use token-only QR now

/* ────────────────────────────────────────────────────────────────────────── */
/* App deep-link & public URL settings (kept; label QR no longer uses them)  */
/* ────────────────────────────────────────────────────────────────────────── */
const APP_ORIGIN=typeof window!=='undefined'?window.location.origin:'';
const EQUIP_ROUTE_PREFIX='/equipment/';

// Prefer deriving from env; fallback to your project ref (used only for comments)
const SUPA_URL=
  (typeof import.meta!=='undefined'&&import.meta.env?.VITE_SUPABASE_URL)||
  'https://ymjnholeztepjnbcbjcr.supabase.co';

/** Public QR landing page (Storage) — used only for auto-barcode backfill */
const PUBLIC_QR_PAGE='https://ymjnholeztepjnbcbjcr.supabase.co/storage/v1/object/public/qr/index.html';

// Toggle for auto-barcode backfill (unchanged behavior)
const PREFER_PUBLIC=true;

/* ----------------- tiny utils ----------------- */
const cls=(...a)=>a.filter(Boolean).join(' ');
const toBool=(v)=>String(v).toLowerCase()==='true';
const fmtDate=(d)=>{try{if(!d)return '—';const dt=new Date(d);if(isNaN(dt))return '—';return dt.toLocaleDateString();}catch{return '—';}};

/* compact display helpers */
const isUrl=(s)=>{try{new URL(String(s));return true;}catch{return false;}};
const prettyBarcode=(s)=>{
  if(!s){return '';}
  const str=String(s);
  try{
    const u=new URL(str);
    const tok=u.searchParams.get('id');
    if(tok&&tok.length>8){return `QR • ${tok.slice(0,4)}…${tok.slice(-4)}`;}
    const path=u.pathname.replace(/^\/+|\/+$/g,'');
    const short=path.length>18?`${path.slice(0,18)}…`:path;
    return `${u.hostname}/${short}`;
  }catch{
    return str.length>24?`${str.slice(0,24)}…`:str;
  }
};
const prettyRfid=(s)=>{
  if(!s){return '';}
  const str=String(s);
  if(isUrl(str)){return prettyBarcode(str);}
  return str.length>20?`RFID • ${str.slice(0,6)}…${str.slice(-4)}`:`RFID • ${str}`;
};
const copyToClipboard=(t)=>{
  if(!t){return;}
  navigator.clipboard.writeText(t).then(()=>toast.success('Copied to clipboard')).catch(()=>toast.error('Copy failed'));
};

/* ---------- Icon inputs/selects ---------- */
const IconInput=({icon:Icon,value,onChange,placeholder,type='text',required=false,color='text-indigo-600'})=>(
  <div className="relative">
    <div className={`absolute inset-y-0 left-2 flex items-center pointer-events-none ${color}`}>
      <Icon className="h-4 w-4"/>
    </div>
    <input
      type={type}
      required={required}
      value={value||''}
      onChange={onChange}
      placeholder={placeholder}
      autoComplete="off"
      className="border rounded text-sm w-full p-2 pl-8"
    />
  </div>
);

const ChevronDownFake=()=>(<svg className="h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 9l6 6 6-6"/></svg>);

const IconSelect=({icon:Icon,value,onChange,children,disabled=false,leftColor='text-blue-600'})=>(
  <div className="relative">
    <div className={`absolute inset-y-0 left-2 flex items-center pointer-events-none ${leftColor}`}>
      <Icon className="h-4 w-4"/>
    </div>
    <select
      value={value||''}
      onChange={onChange}
      disabled={disabled}
      className="border rounded text-sm w-full p-2 pl-8 pr-8 appearance-none disabled:bg-gray-100"
    >
      {children}
    </select>
    <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
      <ChevronDownFake/>
    </div>
  </div>
);

/* ----------------- Category options (fallback list) ----------------- */
const FALLBACK_CATEGORIES=[
  'Processing Equipment',
  'Formulation Equipment',
  'Sterilization Equipment',
  'Packaging Equipment',
  'Quality Control and Analytical Equipment',
  'Cleanroom Equipment',
  'Material Handling Equipment',
  'Laboratory Equipment',
  'Utility Equipment',
  'Filling and Sealing Equipment'
];

/* 🚫 Words that must NEVER be used as Category names */
const DISALLOWED_CATEGORY_NAMES=new Set(['portable','immovable']);

/* ------- helpers: download + csv compose ------- */
const downloadText=(filename,text,mime='text/csv')=>{
  const blob=new Blob([text],{type:mime}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
};
const csvLine=(arr)=>arr.map((v)=>String(v??'').replace(/"/g,'""')).map((v)=>/[,\"\n]/.test(v)?`"${v}"`:v).join(',');
const downloadAssetTemplate=()=>{
  const headers=[
    'asset_code','name','category_name','equip_type',
    'serial_no','manufacturer','model','install_date',
    'calibration_done_on','calibration_due_on',
    'plant_code','subplant_code','department_code','area_code',
    'barcode','rfid','gmp_critical','warranty_expiry','status'
  ];
  const sample=[
    'HVAC-001','Air Handler AHU-1','Processing Equipment','Immovable',
    'SN-123','Trane','T-500','2024-04-01',
    '2024-09-01','2025-09-01',
    'PLANT1','SP1','ENG','AREA-A',
    'ABC123','',true,'2026-04-01','Active'
  ];
  const csv=[csvLine(headers),csvLine(sample)].join('\n');
  downloadText('asset_import_template.csv',csv);
};

/* ──────────────────────────────────────────────────────────────────────────
   PRINT LABELS (with QR + Logo) — now encodes TOKEN ONLY in QR
   ────────────────────────────────────────────────────────────────────────── */
const printAssetLabels=async(rows,{w=62,h=29,cols=2,useQR=true}={})=>{
  const pick=(r,keys)=>{for(const k of keys){const v=r?.[k];if(v!==undefined&&v!==null&&String(v).trim()!=='')return String(v);}return '';};
  const short=(s)=>!s?'':(s.length>12?`${s.slice(0,4)}…${s.slice(-4)}`:s);

  const getLogoDataURL=async()=>{
    try{
      const res=await fetch(logo);
      const blob=await res.blob();
      return await new Promise((resolve)=>{
        const rd=new FileReader();
        rd.onload=()=>resolve(rd.result);
        rd.readAsDataURL(blob);
      });
    }catch{return '';}
  };

  const items=[];
  for(const r of rows||[]){
    // === TOKEN-ONLY PAYLOAD (no URLs) ===
    const token = r.qr_token || r.public_token || null;
    const fallbackCode = r.asset_code ? `EQ:${r.asset_code}` : '';
    const payload = useQR ? (token || fallbackCode) : fallbackCode; // when QR off, we still show code text block

    if(!payload) continue;
    items.push({
      payload,
      title: pick(r,['name','equipment_name']) || pick(r,['asset_code','equipment_id']),
      equipId: pick(r,['asset_code','equipment_id']),
      caption: token ? `QR • ${short(token)}` : (fallbackCode || '')
    });
  }
  if(!items.length){alert('No rows with a token or asset code to print.');return;}

  let qrSrc=[];
  if(useQR){
    try{qrSrc=await Promise.all(items.map((it)=>QRCode.toDataURL(it.payload,{margin:0})));}catch{qrSrc=items.map(()=> '');}
  }else{
    qrSrc=items.map(()=> '');
  }

  const logoURL=await getLogoDataURL();

  const grid=items.map((it,i)=>`
    <div class="label">
      <div class="hdr">
        ${logoURL?`<img src="${logoURL}" alt="logo"/>`:''}
        <div class="meta">
          <div class="ttl">${(it.title||'').replace(/</g,'&lt;')}</div>
          <div class="sub">ID: ${(it.equipId||'').replace(/</g,'&lt;')}</div>
        </div>
      </div>
      ${
        qrSrc[i]
          ? `<div class="qrcode">
               <img src="${qrSrc[i]}" alt="QR"/>
               ${it.caption?`<div class="cap">${(it.caption||'').replace(/</g,'&lt;')}</div>`:''}
             </div>`
          : `<div class="code">${(it.equipId||'').replace(/</g,'&lt;')}</div>`
      }
    </div>
  `).join('');

  const html=`
    <!doctype html>
    <html><head><meta charset="utf-8"/><title>Asset Labels</title>
    <style>
      @page{margin:6mm}
      body{font-family:Inter,Arial,sans-serif;-webkit-print-color-adjust:exact;color-adjust:exact}
      .grid{display:grid;grid-template-columns:repeat(${cols},${w}mm);gap:4mm}
      .label{width:${w}mm;height:${h}mm;border:1px solid #ccc;padding:2mm;display:flex;flex-direction:column;justify-content:space-between}
      .hdr{display:flex;gap:3mm;align-items:flex-start}
      .hdr img{height:8mm}
      .meta{line-height:1.1}
      .ttl{font-weight:700;font-size:3mm}
      .sub{font-size:2.5mm;color:#333}
      .qrcode{display:flex;flex-direction:column;align-items:center;justify-content:center}
      .qrcode img{max-height:14mm;max-width:100%}
      .cap{font-size:2.5mm;color:#222;margin-top:1mm}
      .code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:4mm;letter-spacing:.5mm;text-align:center;border:1px dashed #ddd;padding:2mm 1mm;margin-top:1mm}
    </style></head>
    <body><div class="grid">${grid}</div></body></html>
  `;

  const iframe=document.createElement('iframe');
  iframe.style.position='fixed'; iframe.style.right='0'; iframe.style.bottom='0';
  iframe.style.width='0'; iframe.style.height='0'; iframe.style.border='0';
  document.body.appendChild(iframe);

  const doc=iframe.contentDocument||iframe.contentWindow?.document;
  doc.open(); doc.write(html); doc.close();

  iframe.onload=async()=>{
    const w=iframe.contentWindow;
    try{await w.document.fonts?.ready;}catch{}
    const imgs=Array.from(w.document.images||[]);
    await Promise.all(imgs.map((img)=>img.decode?img.decode().catch(()=>{}):(img.complete?Promise.resolve():new Promise((res)=>img.addEventListener('load',res,{once:true})))));
    w.focus(); w.print();
    setTimeout(()=>document.body.removeChild(iframe),800);
  };
};

/* ----------------- Snackbar ----------------- */
const Snackbar=({open,message,onClose})=>{
  if(!open){return null;}
  return (
    <div className='fixed bottom-4 right-4 z-50'>
      <div className='bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3'>
        <span className='text-sm whitespace-pre-line'>{message}</span>
        <button onClick={onClose} className='opacity-70 hover:opacity-100'><X size={16}/></button>
      </div>
    </div>
  );
};

/* ----------------- E-Sign Modal ----------------- */
const ESignModal=({open,onClose,recordTable,recordId,action,onSigned})=>{
  const [reason,setReason]=useState('');
  const [loading,setLoading]=useState(false);
  const sign=async()=>{
    try{setLoading(true);
      const {data:user}=await supabase.auth.getUser();
      const uid=user?.user?.id; const name=user?.user?.email||'user';
      if(!uid){throw new Error('Not authenticated');}
      const payload={record_table:recordTable,record_id:recordId,action,signer_uid:uid,signer_name:name,reason};
      const hash=btoa(`${recordTable}|${recordId}|${action}|${uid}|${new Date().toISOString()}|${reason}`);
      const op=supabase.from('electronic_signature').insert([{...payload,hash}]);
      await toast.promise(op,{loading:'Signing...',success:'Signed',error:(e)=>e?.message||'Sign error'});
      onSigned?.(); onClose?.();
    }catch(e){/* toast already handled */}
    finally{setLoading(false);}
  };
  if(!open){return null;}
  return (
    <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50'>
      <div className='bg-white rounded-xl p-4 w-full max-w-md shadow-xl'>
        <h3 className='text-lg font-semibold mb-2'>Electronic Signature</h3>
        <p className='text-sm mb-3'>Action: <span className='font-mono'>{action}</span></p>
        <textarea className='w-full border rounded p-2 text-sm' rows={4} placeholder='Reason/justification' value={reason} onChange={(e)=>setReason(e.target.value)}/>
        <div className='mt-3 flex gap-2 justify-end'>
          <Button onClick={onClose} variant='outline'>Cancel</Button>
          <Button onClick={sign} disabled={loading}><ShieldCheck size={16} className='mr-1'/>Sign</Button>
        </div>
      </div>
    </div>
  );
};

/* ----------------- Migrations Panel (unchanged core) ----------------- */
const MigrationsPanel=({open,onClose,setSnack,setSnackOpen,refreshAssets,selectedAssetCodes})=>{
  const [batches,setBatches]=useState([]);
  const [maps,setMaps]=useState([]);
  const [busy,setBusy]=useState(false);
  const [dryStats,setDryStats]=useState(null);
  const [isAdmin,setIsAdmin]=useState(false);
  const [conflicts,setConflicts]=useState([]);
  const [companyName,setCompanyName]=useState('DigitizerX');
  const [userEmail,setUserEmail]=useState('');
  const [logs,setLogs]=useState([]);
  const [useSelectedOnly,setUseSelectedOnly]=useState(false);

  const appendLog=(line)=>setLogs((arr)=>[...arr,`${new Date().toLocaleString()} — ${line}`]);

  const loadAdmin=async()=>{
    try{
      const {data:user}=await supabase.auth.getUser();
      setUserEmail(user?.user?.email||'');
      const {data,error}=await supabase.rpc('_is_admin');
      if(!error){setIsAdmin(!!data);}
    }catch(e){/* ignore */}
  };

  const loadBatches=async()=>{
    const {data:bs,error:be}=await supabase.from('asset_migration_batch').select('id,initiated_by,initiated_at,notes').order('initiated_at',{ascending:false});
    if(!be&&bs){setBatches(bs);}
    const ids=bs?.map((b)=>b.id)||[];
    if(ids.length){
      const {data:ms,error:me}=await supabase.from('asset_migration_map').select('equipment_uid,asset_uid,batch_uid').in('batch_uid',ids);
      if(!me&&ms){setMaps(ms);}
    }else{setMaps([]);}
  };

  useEffect(()=>{if(open){loadAdmin();loadBatches();}},[open]);

  const conflictCheck=async()=>{
    const eqRes=await supabase.from('equipment_master').select('id,equipment_id,equipment_name').limit(10000);
    if(eqRes.error){throw eqRes.error;}
    const eq=eqRes.data||[];
    if(!eq.length){return {conflicts:[],sample:[]};}
    const codes=Array.from(new Set(eq.map((e)=>e.equipment_id).filter(Boolean)));
    const asRes=await supabase.from('asset').select('id,asset_code,migration_batch_uid').in('asset_code',codes);
    if(asRes.error){throw asRes.error;}
    const as=asRes.data||[];
    const eqIds=eq.map((e)=>e.id);
    const mapRes=await supabase.from('asset_migration_map').select('equipment_uid,asset_uid,batch_uid').in('equipment_uid',eqIds);
    if(mapRes.error){throw mapRes.error;}
    const mp=mapRes.data||[];
    const mappedEquip=new Set(mp.map((m)=>m.equipment_uid));
    const assetsByCode=new Map(as.map((a)=>[a.asset_code,a]));
    const found=[];
    for(const e of eq){
      const hasAsset=assetsByCode.has(e.equipment_id);
      const wasMapped=mappedEquip.has(e.id);
      if(hasAsset&&!wasMapped){
        const a=assetsByCode.get(e.equipment_id);
        found.push({equipment_uid:e.id,asset_id:a.id,asset_code:e.equipment_id,equipment_name:e.equipment_name});
      }
    }
    const sample=found.slice(0,20);
    return {conflicts:found,sample};
  };

  const runDryRun=async()=>{
    try{
      setBusy(true);
      const {data,error}=await toast.promise(
        supabase.rpc('migrate_equipment_to_asset',{p_dry_run:true}),
        {loading:'Dry run…',success:'Dry run complete',error:(e)=>e?.message||'Dry run failed'}
      );
      if(error){throw error;}
      setDryStats(data);
      appendLog(`Dry run → to_insert=${data.to_insert}, already_present=${data.already_present}`);
      setSnack(`✅ Dry run complete:\nTo insert: ${data.to_insert}\nAlready present: ${data.already_present}`); setSnackOpen(true);
    }catch(e){/* toast handled */}
    finally{setBusy(false);}
  };

  const runMigrate=async()=>{
    try{
      setBusy(true);
      setSnack('Checking for conflicts…'); setSnackOpen(true);
      const {conflicts:found,sample}=await conflictCheck();
      setConflicts(found);
      if(found.length){
        const msg=`⚠️ Migration blocked.\nConflicts for ${found.length} equipment_id(s).\nExamples: ${sample.map((s)=>s.asset_code).join(', ')}`;
        setSnack(msg); setSnackOpen(true);
        appendLog(`Migration blocked due to ${found.length} conflict(s).`);
        alert(`Migration blocked.\nFound ${found.length} conflicting asset_code(s).\nExamples: ${sample.map((s)=>s.asset_code).join(', ')}`);
        return;
      }
      const {data,error}=await toast.promise(
        supabase.rpc('migrate_equipment_to_asset',{p_dry_run:false}),
        {loading:'Migrating…',success:'Migration complete',error:(e)=>e?.message||'Migration failed'}
      );
      if(error){throw error;}
      setSnack(`✅ Migration complete.\nBatch: ${data.batch_uid}\nInserted: ${data.inserted}\nAlready present: ${data.already_present}\nCategories: ${data.categories_inserted}`); setSnackOpen(true);
      appendLog(`Migration complete. batch=${data.batch_uid}, inserted=${data.inserted}, already_present=${data.already_present}, categories=${data.categories_inserted}`);
      await loadBatches();
      await refreshAssets?.();
    }catch(e){/* toast handled */}
    finally{setBusy(false);}
  };

  const rollbackBatch=async(batchId)=>{
    try{
      const ok=confirm(`Rollback batch ${batchId}? This deletes migrated assets for this batch.`);
      if(!ok){return;}
      setBusy(true);
      const {data,error}=await toast.promise(
        supabase.rpc('rollback_migrated_equipment',{p_batch_uid:batchId,p_force:false}),
        {loading:'Rolling back…',success:'Rollback complete',error:(e)=>e?.message||'Rollback failed'}
      );
      if(error){throw error;}
      setSnack(`✅ Rollback complete.\nRolled back: ${data.rolled_back}\nBatch: ${data.batch_uid}`); setSnackOpen(true);
      appendLog(`Rollback complete for batch=${data.batch_uid}, rolled_back=${data.rolled_back}`);
      await loadBatches();
      await refreshAssets?.();
    }catch(e){/* toast handled */}
    finally{setBusy(false);}
  };

  if(!open){return null;}
  return (
    <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50'>
      <div className='bg-white rounded-xl p-4 w-full max-w-4xl shadow-xl'>
        <div className='flex items-center justify-between mb-3'>
          <h3 className='text-lg font-semibold flex items-center gap-2'><Database size={18}/> Migrations</h3>
          <button onClick={onClose} className='opacity-70 hover:opacity-100'><X size={18}/></button>
        </div>

        {!isAdmin&&(
          <div className='mb-3 p-2 rounded bg-red-50 text-red-700 text-sm flex items-center gap-2'>
            <AlertTriangle size={16}/> Admin/Super Admin required to run migrations or rollbacks.
          </div>
        )}

        <div className='grid grid-cols-3 gap-3 mb-3'>
          <div className='col-span-3 sm:col-span-1 border rounded p-3'>
            <div className='text-sm font-semibold mb-2 flex items-center gap-2'><Info size={14}/> Actions</div>
            <div className='flex flex-col gap-2'>
              <label className='text-xs text-gray-600'>Company Name</label>
              <input className='border rounded px-2 py-1 text-sm mb-2' value={companyName} onChange={(e)=>setCompanyName(e.target.value)} placeholder='Your company or site name'/>
              <label className='flex items-center gap-2 text-xs mb-2'>
                <input type='checkbox' checked={useSelectedOnly} onChange={(e)=>setUseSelectedOnly(e.target.checked)}/>
                Include selected assets only in CSV/PDF
              </label>
              <Button onClick={runDryRun} disabled={busy||!isAdmin}><RefreshCw size={14} className='mr-1'/>Dry Run</Button>
              <Button onClick={runMigrate} disabled={busy||!isAdmin}><Database size={14} className='mr-1'/>Migrate</Button>
              <div className='flex gap-2 mt-2'>
                <Button variant='outline' onClick={()=>{
                  const rows=conflicts;
                  if(!rows.length){toast.error('No conflicts to export.');return;}
                  const headers=['equipment_uid','asset_id','asset_code','equipment_name'];
                  const csv=[headers.join(',')].concat(rows.map((c)=>headers.map((h)=>`${String(c[h]??'').replace(/"/g,'""')}`).join(','))).join('\n');
                  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob);
                  const a=document.createElement('a'); a.href=url; a.download=`conflicts_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`; a.click(); URL.revokeObjectURL(url);
                  toast.success(`Exported ${rows.length} conflict(s)`);
                }} disabled={!conflicts.length}><FileDown size={14} className='mr-1'/>Export Conflicts</Button>
                <Button variant='outline' onClick={()=>{
                  const rows=conflicts;
                  if(!rows.length&&(!logs||!logs.length)){toast.error('Nothing to include in report.');return;}
                  const title=`${companyName} — CMMS Migration Report`;
                  const w=window.open('','_blank','noopener,noreferrer');
                  if(!w){alert('Popup blocked.');return;}
                  const style=`
                    <style>
                      @media print {.no-print{display:none}}
                      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:24px;color:#222}
                      .hdr{display:flex;align-items:center;gap:12px;margin-bottom:16px}
                      .hdr img{height:40px}
                      .title{font-size:20px;font-weight:600}
                      .muted{color:#666;font-size:12px}
                      h2{font-size:16px;margin:16px 0 8px}
                      table{width:100%;border-collapse:collapse;font-size:12px}
                      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
                      th{background:#f5f5f5}
                      .log{white-space:pre-wrap;background:#fafafa;border:1px solid #eee;padding:8px;border-radius:8px}
                      .footer{margin-top:16px;font-size:12px;color:#666}
                      .chip{display:inline-block;padding:2px 8px;border-radius:999px;background:#eef;color:#334}
                    </style>
                  `;
                  const conflictsTable=rows.length?`
                    <h2>Conflicts (${rows.length})</h2>
                    <table>
                      <thead><tr><th>Equipment UID</th><th>Asset ID</th><th>Asset Code</th><th>Equipment Name</th></tr></thead>
                      <tbody>${rows.map((c)=>`<tr><td>${c.equipment_uid||''}</td><td>${c.asset_id||''}</td><td>${c.asset_code||''}</td><td>${(c.equipment_name||'').toString().replace(/</g,'&lt;')}</td></tr>`).join('')}</tbody>
                    </table>
                  `:`<div class="muted">No conflicts detected.</div>`;
                  const logsBlock=logs.length?`
                    <h2>Log</h2>
                    <div class="log">${logs.map((l)=>`• ${l}`).join('\n')}</div>
                  `:`<div class="muted">No log entries.</div>`;
                  const html=`
                    <!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${style}</head>
                    <body>
                      <div class="hdr">
                        <img src="${logo}" alt="Logo"/>
                        <div>
                          <div class="title">${title}</div>
                          <div class="muted">Generated: ${new Date().toLocaleString()} • User: ${userEmail||'-'}</div>
                        </div>
                        <div style="margin-left:auto" class="no-print">
                          <button onclick="window.print()" style="padding:6px 10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer">Print / Save PDF</button>
                        </div>
                      </div>
                      ${conflictsTable}
                      ${logsBlock}
                      <div class="footer">Report summarizes migration readiness/activity for equipment_master → asset.</div>
                    </body></html>
                  `;
                  w.document.open(); w.document.write(html); w.document.close();
                  toast.success('Opened PDF preview');
                }} disabled={!conflicts.length&&!logs.length}><Printer size={14} className='mr-1'/>Preview PDF</Button>
              </div>
              <div className='text-xs text-gray-500 mt-1'>Conflicts appear after a blocked Migrate (collisions).</div>
            </div>

            {dryStats&&(
              <div className='mt-3 text-xs bg-gray-50 border rounded p-2'>
                <div>To insert: <b>{dryStats.to_insert}</b></div>
                <div>Already present: <b>{dryStats.already_present}</b></div>
              </div>
            )}

            <div className='mt-3'>
              <div className='text-xs font-semibold mb-1'>Log</div>
              <div className='max-h-36 overflow-auto text-xs bg-gray-50 border rounded p-2 whitespace-pre-wrap'>
                {logs.length? logs.map((l,i)=>(<div key={i}>• {l}</div>)) : <span className='text-gray-500'>No log entries yet.</span>}
              </div>
            </div>
          </div>

          <div className='col-span-3 sm:col-span-2 border rounded p-3'>
            <div className='text-sm font-semibold mb-2'>Batches</div>
            <div className='max-h-64 overflow-auto'>
              <table className='w-full text-sm'>
                <thead className='bg-gray-50 sticky top-0'>
                  <tr>
                    <th className='p-2 text-left'>Batch</th>
                    <th className='p-2 text-left'>Inserted Rows</th>
                    <th className='p-2 text-left'>Initiated</th>
                    <th className='p-2 text-left'>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.length===0&&(<tr><td className='p-2 text-gray-500' colSpan={4}>No batches yet.</td></tr>)}
                  {batches.map((b)=>(
                    <tr key={b.id} className='border-t'>
                      <td className='p-2 font-mono text-xs'>{b.id}</td>
                      <td className='p-2'>{maps.filter((m)=>m.batch_uid===b.id).length}</td>
                      <td className='p-2'>{new Date(b.initiated_at).toLocaleString()}</td>
                      <td className='p-2'>
                        <Button variant='outline' onClick={()=>rollbackBatch(b.id)} disabled={busy||!isAdmin}><Trash2 size={14} className='mr-1'/>Rollback</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className='text-xs text-gray-600 mt-3'>
              <div><b>Conflict guard:</b> migration is blocked if any <code>equipment_master.equipment_id</code> matches an <code>asset.asset_code</code> not mapped. Resolve those first.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ----------------- Status badge ----------------- */
const StatusBadge=({status})=>{
  const s=(status||'Active').toLowerCase();
  const klass=s==='active'
    ?'bg-emerald-100 text-emerald-700 border border-emerald-200'
    :s==='out of service'
      ?'bg-amber-100 text-amber-800 border border-amber-200'
      :'bg-rose-100 text-rose-700 border border-rose-200';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${klass}`}>{status||'—'}</span>;
};

/* ----------------- Main Component ----------------- */
const AssetManagement=()=>{
  const [rows,setRows]=useState([]);           // table rows (with derived category_name)
  const [assetIds,setAssetIds]=useState(new Set());
  const [loading,setLoading]=useState(false);

  // DB category list
  const [dbCategories,setDbCategories]=useState([]); // [{id,name}]

  // Editor form
  const [form,setForm]=useState({
    id:null,asset_code:'',name:'',category_name:'',equip_type:'Immovable',
    serial_no:'',manufacturer:'',model:'',install_date:'',
    calibration_done_on:'',calibration_due_on:'',
    plant_code:'',subplant_code:'',department_code:'',area_code:'',
    barcode:'',rfid:'',gmp_critical:false,warranty_expiry:'',status:'Active'
  });

  // FK selections (UIDs)
  const [selPlantId,setSelPlantId]=useState('');
  const [selSubplantId,setSelSubplantId]=useState('');
  const [selDepartmentId,setSelDepartmentId]=useState('');
  const [selAreaId,setSelAreaId]=useState('');

  // Lookups
  const [plants,setPlants]=useState([]);
  const [subplants,setSubplants]=useState([]);
  const [departments,setDepartments]=useState([]);
  const [areas,setAreas]=useState([]);
  const [lookupErrors,setLookupErrors]=useState([]);

  // UI
  const [q,setQ]=useState('');
  const [editing,setEditing]=useState(false);
  const [showSign,setShowSign]=useState(false);
  const [showMigrations,setShowMigrations]=useState(false);
  const [snack,setSnack]=useState(''); const [snackOpen,setSnackOpen]=useState(false);
  const [qrMode,setQrMode]=useState(true);
  const [selectedIds,setSelectedIds]=useState(new Set());
  const fileRef=useRef(null);

  useEffect(()=>{setQrMode(localStorage.getItem('dx_asset_label_qr')==='1');},[]);
  useEffect(()=>{localStorage.setItem('dx_asset_label_qr',qrMode?'1':'0');},[qrMode]);

  /* Categories from DB (for dropdown + name mapping) */
  const loadCategories=async()=>{
    const {data,error}=await supabase
      .from('asset_category')
      .select('id,name')
      .order('name',{ascending:true});
    if(error){
      toast.error(`Category load failed: ${error.message}`);
      setDbCategories([]);
      return [];
    }
    setDbCategories(data||[]);
    return data||[];
  };

  const categoryMap=useMemo(()=>new Map(
    dbCategories
      .filter((c)=>!DISALLOWED_CATEGORY_NAMES.has(String(c.name||'').toLowerCase()))
      .map((c)=>[String(c.id),c.name])
  ),[dbCategories]);

  const categoryOptions=useMemo(()=>{
    const raw=new Set([...(dbCategories||[]).map((c)=>c.name),...FALLBACK_CATEGORIES]);
    const cleaned=Array.from(raw).filter((n)=>!DISALLOWED_CATEGORY_NAMES.has(String(n||'').toLowerCase()));
    return cleaned.sort((a,b)=>a.localeCompare(b));
  },[dbCategories]);

  /* lookups */
  const normPlant=(r)=>({id:r.id,code:r.plant_id||r.plant_code||String(r.id),name:r.description||r.name||''});
  const normSubplant=(r)=>({id:r.id,code:r.subplant_id||r.subplant_code||String(r.id),name:r.subplant_name||r.name||'',plant_uid:r.plant_uid??null});
  const normDepartment=(r)=>({id:r.id,code:r.department_id||r.department_code||String(r.id),name:r.department_name||r.name||'',subplant_uid:r.subplant_uid??null});
  const normArea=(r)=>({id:r.id,code:r.area_id||r.area_code||String(r.id),name:r.area_name||r.name||'',department_uid:r.department_uid??null,subplant_uid:r.subplant_uid??null,plant_uid:r.plant_uid??null});

  const loadLookups=async()=>{
    const errs=[];
    try{
      const [p,sp,dp,ar]=await Promise.allSettled([
        supabase.from('plant_master').select('id,plant_id,description').order('plant_id',{ascending:true}),
        supabase.from('subplant_master').select('id,subplant_id,subplant_name,plant_uid').order('subplant_id',{ascending:true}),
        supabase.from('department_master').select('id,department_id,department_name,subplant_uid').order('department_id',{ascending:true}),
        supabase.from('area_master').select('id,area_id,area_name,department_uid,subplant_uid,plant_uid').order('area_id',{ascending:true}),
      ]);
      if(p.status==='fulfilled'&&!p.value.error) setPlants((p.value.data||[]).map(normPlant)); else{errs.push(`plant_master: ${p.value?.error?.message||p.reason?.message||'unavailable'}`); setPlants([]);}
      if(sp.status==='fulfilled'&&!sp.value.error) setSubplants((sp.value.data||[]).map(normSubplant)); else{errs.push(`subplant_master: ${sp.value?.error?.message||p.reason?.message||'unavailable'}`); setSubplants([]);}
      if(dp.status==='fulfilled'&&!dp.value.error) setDepartments((dp.value.data||[]).map(normDepartment)); else{errs.push(`department_master: ${dp.value?.error?.message||p.reason?.message||'unavailable'}`); setDepartments([]);}
      if(ar.status==='fulfilled'&&!ar.value.error) setAreas((ar.value.data||[]).map(normArea)); else{errs.push(`area_master: ${ar.value?.error?.message||p.reason?.message||'unavailable'}`); setAreas([]);}
    }catch(e){errs.push(e.message||String(e));}
    finally{setLookupErrors(errs);}
  };

  /* Fetch assets and derive category_name from category_uid. */
  const refreshAssets=async(freshCats=null)=>{
    try{
      setLoading(true);
      const {data,error}=await supabase
        .from('asset')
        .select('id,asset_code,name,status,barcode,rfid,public_token,qr_token,category_uid,equip_type,serial_no,manufacturer,model,install_date,calibration_done_on,calibration_due_on,created_at')
        .order('asset_code',{ascending:true})
        .limit(1000);

      if(error){throw error;}

      const cats=Array.isArray(freshCats)?freshCats:dbCategories;
      const localCatMap=new Map(
        (cats||[])
          .filter((c)=>!DISALLOWED_CATEGORY_NAMES.has(String(c.name||'').toLowerCase()))
          .map((c)=>[String(c.id),c.name])
      );

      const arr=(data||[]).map((r)=>({
        ...r,
        category_name:r.category_uid?(localCatMap.get(String(r.category_uid))||''):''
      }));

      setRows(arr);
      setAssetIds(new Set(arr.map((r)=>r.id)));
      setSelectedIds(new Set());
      setSnack(`✅ Loaded ${arr.length} record(s)`); setSnackOpen(true);
    }catch(e){toast.error(e.message||'Fetch failed');}
    finally{setLoading(false);}
  };

  // Initial load
  useEffect(()=>{
    (async()=>{
      const cats=await loadCategories();
      await loadLookups();
      await refreshAssets(cats);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Update category names in rows if the map changes later
  useEffect(()=>{
    if(!rows.length||categoryMap.size===0) return;
    setRows((prev)=>prev.map((r)=>({
      ...r,
      category_name:r.category_uid?(categoryMap.get(String(r.category_uid))||''):r.category_name||''
    })));
  },[categoryMap]); // eslint-disable-line

  const filtered=useMemo(()=>{
    const s=q.trim().toLowerCase();
    if(!s){return rows;}
    return rows.filter((r)=>[
      r.asset_code,r.name,r.category_name,r.equip_type,r.serial_no,r.manufacturer,r.model,r.barcode,r.rfid
    ].some((x)=>String(x||'').toLowerCase().includes(s)));
  },[rows,q]);

  const resetForm=()=>{
    setForm({
      id:null,asset_code:'',name:'',category_name:'',equip_type:'Immovable',
      serial_no:'',manufacturer:'',model:'',install_date:'',
      calibration_done_on:'',calibration_due_on:'',
      plant_code:'',subplant_code:'',department_code:'',area_code:'',
      barcode:'',rfid:'',gmp_critical:false,warranty_expiry:'',status:'Active'
    });
    setSelPlantId(''); setSelSubplantId(''); setSelDepartmentId(''); setSelAreaId('');
  };

  const isAssetRow=(r)=>assetIds.has(r.id);

  /* Create (or find) category uid for a given name */
  const ensureCategory=async(name)=>{
    const n=(name||'').trim();
    if(!n) return null;

    if(DISALLOWED_CATEGORY_NAMES.has(n.toLowerCase())){
      toast.error('Category cannot be "Portable" or "Immovable" — use the Type field instead.');
      return null;
    }

    const hit=dbCategories.find((c)=>(c.name||'').toLowerCase()===n.toLowerCase());
    if(hit) return hit.id;

    const {data:found}=await supabase.from('asset_category').select('id,name').ilike('name',n).maybeSingle();
    if(found?.id){
      setDbCategories((prev)=>prev.some((p)=>p.id===found.id)?prev:[...prev,found]);
      return found.id;
    }

    const ins=await supabase.from('asset_category').insert([{name:n}]).select('id,name').single();
    if(ins.error) throw ins.error;
    setDbCategories((prev)=>[...prev,ins.data]);
    return ins.data.id;
  };

  const upsertAsset=async(override=null)=>{
    const src=override?{...form,...override}:{...form};
    const actionText=src.id&&assetIds.has(src.id)?`Updating ${src.asset_code||'(no code)'}…`:`Saving ${src.asset_code||'(no code)'}…`;
    const successText=src.id&&assetIds.has(src.id)?`Updated ${src.asset_code||'asset'}`:`Saved ${src.asset_code||'asset'}`;

    await toast.promise((async()=>{
      const category_uid=await ensureCategory(src.category_name);

      const plant_uid=selPlantId||null;
      const subplant_uid=selSubplantId||null;
      const department_uid=selDepartmentId||null;
      const area_uid=selAreaId||null;

      const payload={
        asset_code:(src.asset_code||'').trim(),
        name:(src.name||'').trim(),
        category_uid:category_uid??null,
        serial_no:src.serial_no||null,
        manufacturer:src.manufacturer||null,
        model:src.model||null,
        install_date:src.install_date||null,
        gmp_critical:!!src.gmp_critical,
        warranty_expiry:src.warranty_expiry||null,
        status:src.status||'Active',
        barcode:src.barcode||null,
        rfid:src.rfid||null,
        equip_type:src.equip_type||'Immovable',
        calibration_done_on:src.calibration_done_on||null,
        calibration_due_on:src.calibration_due_on||null,
        plant_uid,subplant_uid,department_uid,area_uid
      };

      let assetId=src.id&&assetIds.has(src.id)?src.id:null;

      if(assetId){
        const {error}=await supabase.from('asset').update(payload).eq('id',assetId);
        if(error){throw error;}
      }else{
        const {data:exist}=await supabase.from('asset').select('id').eq('asset_code',payload.asset_code).maybeSingle();
        if(exist?.id){
          assetId=exist.id;
          const {error}=await supabase.from('asset').update(payload).eq('id',assetId);
          if(error){throw error;}
        }else{
          const ins=await supabase.from('asset').insert([payload]).select('id').single();
          if(ins.error){throw ins.error;}
          assetId=ins.data.id;
        }
      }

      // Keep existing auto-backfill of barcode (URL) if blank — not used for labels any more
      if(assetId){
        const {data:tokRow}=await supabase.from('asset').select('public_token,barcode').eq('id',assetId).single();
        const tok=tokRow?.public_token; const currentBarcode=tokRow?.barcode;
        if(!currentBarcode){
          if(PREFER_PUBLIC&&tok){
            const url=`${PUBLIC_QR_PAGE}?id=${encodeURIComponent(tok)}`;
            await supabase.from('asset').update({barcode:url}).eq('id',assetId);
          }else{
            const url=`${APP_ORIGIN}${EQUIP_ROUTE_PREFIX}${encodeURIComponent(assetId)}`;
            await supabase.from('asset').update({barcode:url}).eq('id',assetId);
          }
        }
      }

      await refreshAssets();
      resetForm(); setEditing(false);
    })(),{loading:actionText,success:successText,error:(e)=>e?.message||'Save failed'});
  };

  const migrateFromLegacy=async(r)=>{
    const ok=confirm('This record comes from equipment_master (read-only). Import into CMMS Assets so it can be edited and tracked?');
    if(!ok){return;}
    await upsertAsset({
      id:null,
      asset_code:r.asset_code||r.equipment_id,
      name:r.name||r.equipment_name,
      category_name:r.category_name||r.equipment_type||'Equipment',
      equip_type:r.equipment_type||'Immovable',
      serial_no:r.serial_no||'',
      manufacturer:r.manufacturer||'',
      model:r.model||'',
      install_date:r.install_date||null,
      calibration_done_on:r.calibration_done_on||null,
      calibration_due_on:r.calibration_due_on||null,
      plant_code:r.plant_code||'',
      subplant_code:r.subplant_code||'',
      department_code:r.department_code||'',
      area_code:r.area_code||'',
      barcode:r.barcode||'',
      rfid:r.rfid||'',
      gmp_critical:!!r.gmp_critical,
      warranty_expiry:r.warranty_expiry||'',
      status:r.status||'Active'
    });
  };

  const retireAsset=async(id)=>{
    await toast.promise((async()=>{
      const {error}=await supabase.from('asset').update({status:'Retired'}).eq('id',id);
      if(error){throw error;}
      await refreshAssets();
    })(),{loading:'Retiring asset…',success:'Asset retired',error:(e)=>e?.message||'Retire failed'});
  };

  const onImport=async(e)=>{
    const file=e.target.files?.[0];
    if(!file){return;}
    const text=await file.text();
    const [headerLine,...lines]=text.split(/\r?\n/).filter((l)=>l.trim().length>0);
    const headers=headerLine.split(',').map((h)=>h.trim());
    const parsed=[];
    for(const line of lines){
      const parts=line.split(',');
      const obj={}; headers.forEach((h,i)=>{obj[h]=parts[i]?parts[i].trim():'';});
      parsed.push(obj);
    }

    await toast.promise((async()=>{
      for(const r of parsed){
        if(r.category_name&&DISALLOWED_CATEGORY_NAMES.has(String(r.category_name).toLowerCase())){
          r.category_name='';
        }
        await upsertAsset({
          id:null,
          asset_code:r.asset_code,name:r.name,category_name:r.category_name,equip_type:r.equip_type||'Immovable',
          serial_no:r.serial_no,manufacturer:r.manufacturer,model:r.model,install_date:r.install_date||null,
          calibration_done_on:r.calibration_done_on||null,calibration_due_on:r.calibration_due_on||null,
          plant_code:r.plant_code,subplant_code:r.subplant_code,department_code:r.department_code,area_code:r.area_code,
          barcode:r.barcode,rfid:r.rfid,gmp_critical:toBool(r.gmp_critical),warranty_expiry:r.warranty_expiry,status:r.status||'Active'
        });
      }
      if(fileRef.current){fileRef.current.value='';}
    })(),{loading:'Importing CSV…',success:`Imported ${parsed.length} row(s)`,error:(e)=>e?.message||'CSV import failed'});
  };

  const onEditClick=async(r)=>{
    if(!isAssetRow(r)){await migrateFromLegacy(r);return;}

    const catNameRaw=r.category_name||(r.category_uid?(categoryMap.get(String(r.category_uid))||''):'');
    const catName=DISALLOWED_CATEGORY_NAMES.has(String(catNameRaw).toLowerCase())?'':(catNameRaw||'');

    setForm({
      id:r.id,asset_code:r.asset_code||'',name:r.name||'',
      category_name:catName,
      equip_type:r.equip_type||'Immovable',
      serial_no:r.serial_no||'',manufacturer:r.manufacturer||'',model:r.model||'',install_date:r.install_date||'',
      calibration_done_on:r.calibration_done_on||'',calibration_due_on:r.calibration_due_on||'',
      plant_code:r.plant_code||'',subplant_code:r.subplant_code||'',department_code:r.department_code||'',area_code:r.area_code||'',
      barcode:r.barcode||'',rfid:r.rfid||'',gmp_critical:!!r.gmp_critical,warranty_expiry:r.warranty_expiry||'',status:r.status||'Active'
    });

    setSelPlantId(r.plant_uid?String(r.plant_uid):'');
    setSelSubplantId(r.subplant_uid?String(r.subplant_uid):'');
    setSelDepartmentId(r.department_uid?String(r.department_uid):'');
    setSelAreaId(r.area_uid?String(r.area_uid):'');

    toast.success(`✏️ Editing ${r.asset_code}`);
    setEditing(true);
  };

  /* selection helpers */
  const allVisibleIds=useMemo(()=>new Set(filtered.map((r)=>r.id)),[filtered]);
  const allChecked=selectedIds.size>0&&[...allVisibleIds].every((id)=>selectedIds.has(id));
  const someChecked=selectedIds.size>0&&!allChecked;

  /* cascading lists */
  const filteredSubplants=useMemo(()=>{
    if(!selPlantId) return subplants;
    return subplants.filter((sp)=>String(sp.plant_uid)===String(selPlantId));
  },[subplants,selPlantId]);

  const filteredDepartments=useMemo(()=>{
    if(!selSubplantId) return departments;
    return departments.filter((d)=>String(d.subplant_uid)===String(selSubplantId));
  },[departments,selSubplantId]);

  const filteredAreas=useMemo(()=>{
    if(selDepartmentId) return areas.filter((a)=>String(a.department_uid)===String(selDepartmentId));
    if(selSubplantId) return areas.filter((a)=>a.subplant_uid!=null&&String(a.subplant_uid)===String(selSubplantId));
    if(selPlantId) return areas.filter((a)=>a.plant_uid!=null&&String(a.plant_uid)===String(selPlantId));
    return areas;
  },[areas,selDepartmentId,selSubplantId,selPlantId]);

  /* change handlers for location dropdowns */
  const onPlantChange=(plantId)=>{
    setSelPlantId(plantId||''); setSelSubplantId(''); setSelDepartmentId(''); setSelAreaId('');
  };
  const onSubplantChange=(subplantId)=>{
    setSelSubplantId(subplantId||''); setSelDepartmentId(''); setSelAreaId('');
  };
  const onDeptChange=(deptId)=>{
    setSelDepartmentId(deptId||''); setSelAreaId('');
  };
  const onAreaChange=(areaId)=>{
    setSelAreaId(areaId||'');
  };

  const getCalibDone=(r)=>r.calibration_done_on||null;
  const getCalibDue=(r)=>r.calibration_due_on||null;

  /* render */
  return (
    <div className='p-4'>
      <Toaster position="top-right"/>
      <div className='flex items-center justify-between mb-3'>
        <h1 className='text-xl font-semibold flex items-center gap-2 text-blue-700'><Package size={18}/> Asset Management</h1>
        <div className='flex items-center gap-2'>
          <div className='relative'>
            <Search size={14} className='absolute left-2 top-2.5 text-indigo-600'/>
            <input
              className='border rounded pl-7 pr-2 py-1 text-sm'
              placeholder='Search by code, name, category, type, barcode, RFID'
              value={q}
              onChange={(e)=>setQ(e.target.value)}
            />
          </div>

          <Button variant='outline' onClick={()=>loadLookups()} title={lookupErrors.length?`Lookups reloaded. Last errors: ${lookupErrors.join(' | ')}`:'Reload lookups'}>
            <RefreshCw size={16} className='mr-1'/>Reload lookups
          </Button>

          <label className='inline-flex items-center gap-1 cursor-pointer' title='Import asset CSV (headers provided via Asset CSV template)'>
            <Upload size={16}/> Import CSV
            <input ref={fileRef} type='file' accept='.csv' className='hidden' onChange={onImport}/>
          </label>
          <Button variant='outline' onClick={downloadAssetTemplate}><Download size={16} className='mr-1'/>Asset CSV</Button>

          <label className='inline-flex items-center gap-2 text-sm px-2 py-1 border rounded cursor-pointer' title='Use QR codes on labels'>
            <input type='checkbox' checked={qrMode} onChange={(e)=>setQrMode(e.target.checked)}/>
            <QrCode size={14}/> Use QR
          </label>

          <Button variant='outline' onClick={()=>{printAssetLabels(filtered,{useQR:qrMode}); toast.success('Opened print preview');}}>
            <Printer size={16} className='mr-1'/>Print Labels
          </Button>
          <Button onClick={()=>{setShowMigrations(true);}}><Database size={16} className='mr-1'/>Migrations</Button>
          <Button onClick={()=>{resetForm(); setEditing(true);}}><Plus size={16} className='mr-1'/>New</Button>
        </div>
      </div>

      <div className={cls('overflow-auto border rounded',loading&&'opacity-60 pointer-events-none')}>
        <table className='w-full text-sm'>
          <thead className='bg-gray-50'>
            <tr>
              <th className='p-2 text-left w-8'>
                <button className='inline-flex items-center gap-1' title='Select All'>
                  <span onClick={()=>{
                    setSelectedIds((prev)=>{
                      const ids=new Set(filtered.map((r)=>r.id));
                      const everySelected=[...ids].every((id)=>prev.has(id));
                      if(everySelected){const n=new Set(prev); ids.forEach((id)=>n.delete(id)); return n;}
                      const n=new Set(prev); ids.forEach((id)=>n.add(id)); return n;
                    });
                  }}>
                    {selectedIds.size>0&&[...new Set(filtered.map((r)=>r.id))].every((id)=>selectedIds.has(id))
                      ? <CheckSquare size={16}/>
                      : selectedIds.size>0 ? <CheckSquare size={16} className='opacity-60'/> : <Square size={16}/>}
                  </span>
                </button>
              </th>
              <th className='p-2 text-left'>Code</th>
              <th className='p-2 text-left'>Name</th>
              <th className='p-2 text-left'>Category</th>
              <th className='p-2 text-left'>Type</th>
              <th className='p-2 text-left'>Status</th>
              <th className='p-2 text-left'>Calib Done</th>
              <th className='p-2 text-left'>Calib Due</th>
              <th className='p-2 text-left w-[260px]'>Barcode</th>
              <th className='p-2 text-left w-[220px]'>RFID</th>
              <th className='p-2 text-left'>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading?(
              Array.from({length:6}).map((_,i)=>(
                <tr key={`sk-${i}`} className="animate-pulse border-t">
                  {Array.from({length:11}).map((__,j)=>(
                    <td key={j} className="p-2">
                      <div className="h-4 bg-gray-200 rounded w-24"/>
                    </td>
                  ))}
                </tr>
              ))
            ):filtered.length?(
              filtered.map((r)=>(
                <tr key={r.id} className='border-t'>
                  <td className='p-2'>
                    <input type='checkbox' checked={selectedIds.has(r.id)} onChange={()=>{
                      setSelectedIds((prev)=>{const n=new Set(prev); if(n.has(r.id)){n.delete(r.id);} else {n.add(r.id);} return n;});
                    }}/>
                  </td>
                  <td className='p-2'>{r.asset_code}</td>
                  <td className='p-2'>{r.name}</td>
                  <td className='p-2'>{r.category_name||'—'}</td>
                  <td className='p-2'>{r.equip_type||'—'}</td>
                  <td className='p-2'><StatusBadge status={r.status}/></td>
                  <td className='p-2'>{fmtDate(r.calibration_done_on)}</td>
                  <td className='p-2'>{fmtDate(r.calibration_due_on)}</td>

                  {/* Barcode cell (compact, tooltip, open+copy) */}
                  <td className='p-2'>
                    {r.barcode?(
                      <div className='flex items-center gap-1 max-w-[260px] whitespace-nowrap overflow-hidden'>
                        <a
                          href={r.barcode}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='truncate text-blue-700 hover:underline'
                          title={r.barcode}
                        >
                          {prettyBarcode(r.barcode)}
                        </a>
                        <button className='p-1 hover:bg-gray-100 rounded' title='Open' onClick={()=>window.open(r.barcode,'_blank','noopener,noreferrer')}>
                          <ExternalLink size={14}/>
                        </button>
                        <button className='p-1 hover:bg-gray-100 rounded' title='Copy' onClick={()=>copyToClipboard(r.barcode)}>
                          <Copy size={14}/>
                        </button>
                      </div>
                    ):'—'}
                  </td>

                  {/* RFID cell */}
                  <td className='p-2'>
                    {r.rfid?(
                      <div className='flex items-center gap-1 max-w-[220px] whitespace-nowrap overflow-hidden'>
                        <span className='truncate' title={String(r.rfid)}>{prettyRfid(r.rfid)}</span>
                        {isUrl(r.rfid)&&(
                          <button className='p-1 hover:bg-gray-100 rounded' title='Open' onClick={()=>window.open(r.rfid,'_blank','noopener,noreferrer')}>
                            <ExternalLink size={14}/>
                          </button>
                        )}
                        <button className='p-1 hover:bg-gray-100 rounded' title='Copy' onClick={()=>copyToClipboard(String(r.rfid))}>
                          <Copy size={14}/>
                        </button>
                      </div>
                    ):'—'}
                  </td>

                  <td className='p-2'>
                    <Button variant='ghost' onClick={()=>onEditClick(r)} title='Edit asset'><Edit3 size={16}/></Button>
                    <Button variant='ghost' onClick={()=>setShowSign(r.id)} title='Retire (e-sign)'><ShieldCheck size={16}/></Button>
                    <Button variant='ghost' onClick={()=>{printAssetLabels([r],{useQR:qrMode}); toast.success('Opened print preview');}} title='Print label'><Printer size={16}/></Button>
                    <Button variant='ghost' onClick={()=>openQRForRow(r)} title='Use QR Code (open)'><QrCode size={16}/></Button>{/* ← opens helper; label QR is token-only */}
                  </td>
                </tr>
              ))
            ):(
              <tr><td className='p-2 text-gray-500' colSpan={11}>No assets found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Editor Modal */}
      {editing&&(
        <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-40'>
          <div className='bg-white rounded-xl p-4 w-full max-w-4xl shadow-xl'>
            <div className='flex items-center justify-between mb-2'>
              <h3 className='text-lg font-semibold'>Asset Editor</h3>
              {lookupErrors.length>0&&(
                <div className='text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded'>
                  Lookup warnings: {lookupErrors.join(' | ')}
                </div>
              )}
            </div>

            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3'>
              <div>
                <label className="block text-xs font-medium mb-1">Asset Code</label>
                <IconInput icon={Tag} value={form.asset_code} onChange={(e)=>setForm({...form,asset_code:e.target.value})} placeholder='HVAC-001' color='text-indigo-600' required/>
                <div className='text-[11px] text-gray-500 mt-1'>Unique business ID (also printed on labels).</div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Asset Name</label>
                <IconInput icon={Package} value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} placeholder='Air Handler AHU-1' color='text-green-600' required/>
              </div>

              {/* Category dropdown */}
              <div>
                <label className="block text-xs font-medium mb-1">Category</label>
                <IconSelect icon={Layers} value={form.category_name} onChange={(e)=>setForm({...form,category_name:e.target.value})} leftColor='text-purple-600'>
                  <option value=''>Select Category</option>
                  {categoryOptions.map((c)=>(<option key={c} value={c}>{c}</option>))}
                </IconSelect>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Type</label>
                <IconSelect icon={Layers} value={form.equip_type} onChange={(e)=>setForm({...form,equip_type:e.target.value})} leftColor='text-amber-600'>
                  <option value='Immovable'>Immovable</option>
                  <option value='Portable'>Portable</option>
                </IconSelect>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Serial No.</label>
                <IconInput icon={Tag} value={form.serial_no} onChange={(e)=>setForm({...form,serial_no:e.target.value})} placeholder='SN-123' color='text-sky-600'/>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Manufacturer</label>
                <IconInput icon={Package} value={form.manufacturer} onChange={(e)=>setForm({...form,manufacturer:e.target.value})} placeholder='Trane' color='text-cyan-600'/>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Model</label>
                <IconInput icon={Package} value={form.model} onChange={(e)=>setForm({...form,model:e.target.value})} placeholder='T-500' color='text-teal-600'/>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Install Date</label>
                <IconInput icon={CalendarCheck} type='date' value={form.install_date} onChange={(e)=>setForm({...form,install_date:e.target.value})} color='text-emerald-600'/>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Calibration Done On</label>
                <IconInput icon={CalendarCheck} type='date' value={form.calibration_done_on} onChange={(e)=>setForm({...form,calibration_done_on:e.target.value})} color='text-orange-600'/>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Calibration Due On</label>
                <IconInput icon={CalendarClock} type='date' value={form.calibration_due_on} onChange={(e)=>setForm({...form,calibration_due_on:e.target.value})} color='text-red-600'/>
              </div>

              {/* Location selects */}
              <div>
                <label className='block text-xs font-medium mb-1'>Plant</label>
                <IconSelect icon={Building2} value={selPlantId} onChange={(e)=>onPlantChange(e.target.value)} leftColor='text-blue-600'>
                  <option value=''>Select Plant</option>
                  {plants.map((p)=>(<option key={`${p.id}`} value={p.id}>{p.code}{p.name?` — ${p.name}`:''}</option>))}
                </IconSelect>
              </div>

              <div>
                <label className='block text-xs font-medium mb-1'>Subplant</label>
                <IconSelect icon={Factory} value={selSubplantId} onChange={(e)=>onSubplantChange(e.target.value)} leftColor='text-green-600' disabled={!selPlantId}>
                  <option value=''>{selPlantId?'Select Subplant':'Select Plant first'}</option>
                  {filteredSubplants.map((sp)=>(<option key={`${sp.id}`} value={sp.id}>{sp.code}{sp.name?` — ${sp.name}`:''}</option>))}
                </IconSelect>
              </div>

              <div>
                <label className='block text-xs font-medium mb-1'>Department</label>
                <IconSelect icon={Briefcase} value={selDepartmentId} onChange={(e)=>onDeptChange(e.target.value)} leftColor='text-purple-600' disabled={!selSubplantId}>
                  <option value=''>{selSubplantId?'Select Department':'Select Subplant first'}</option>
                  {filteredDepartments.map((d)=>(<option key={`${d.id}`} value={d.id}>{d.code}{d.name?` — ${d.name}`:''}</option>))}
                </IconSelect>
              </div>

              <div>
                <label className='block text-xs font-medium mb-1'>Area</label>
                <IconSelect icon={Grid3X3} value={selAreaId} onChange={(e)=>onAreaChange(e.target.value)} leftColor='text-pink-600' disabled={!selDepartmentId}>
                  <option value=''>{selDepartmentId?'Select Area':'Select Department first'}</option>
                  {filteredAreas.map((a)=>(<option key={`${a.id}`} value={a.id}>{a.code}{a.name?` — ${a.name}`:''}</option>))}
                </IconSelect>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Barcode</label>
                <IconInput icon={Tag} value={form.barcode} onChange={(e)=>setForm({...form,barcode:e.target.value})} placeholder='(auto if blank)' color='text-fuchsia-600'/>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">RFID</label>
                <IconInput icon={QrCode} value={form.rfid} onChange={(e)=>setForm({...form,rfid:e.target.value})} placeholder='' color='text-rose-600'/>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Warranty Expiry</label>
                <IconInput icon={CalendarClock} type='date' value={form.warranty_expiry} onChange={(e)=>setForm({...form,warranty_expiry:e.target.value})} color='text-slate-600'/>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Status</label>
                <IconSelect icon={Layers} value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})} leftColor={form.status==='Active'?'text-emerald-600':'text-rose-600'}>
                  <option>Active</option>
                  <option>Out of Service</option>
                  <option>Retired</option>
                </IconSelect>
              </div>

              <div className='flex items-center gap-2'>
                <label className='flex items-center gap-2 text-sm'>
                  <input type='checkbox' checked={!!form.gmp_critical} onChange={(e)=>setForm({...form,gmp_critical:e.target.checked})}/>
                  GMP Critical (affects risk & PM)
                </label>
              </div>
            </div>

            <div className='mt-4 flex justify-between items-center'>
              <div className='text-xs text-gray-500'>
                {lookupErrors.length>0?'Using fallback lists where master tables are blocked/empty.':''}
              </div>
              <div className='flex gap-2'>
                <Button variant='outline' onClick={()=>{setEditing(false); resetForm();}}>Cancel</Button>
                <Button onClick={()=>upsertAsset()}><Save size={16} className='mr-1'/>Save</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ESignModal open={!!showSign} onClose={()=>setShowSign(false)} recordTable='asset' recordId={showSign||''} action='Retire Asset' onSigned={()=>retireAsset(showSign)}/>
      <MigrationsPanel
        open={showMigrations}
        onClose={()=>setShowMigrations(false)}
        setSnack={setSnack}
        setSnackOpen={setSnackOpen}
        refreshAssets={refreshAssets}
        selectedAssetCodes={new Set()}
      />
      <Snackbar open={snackOpen} message={snack} onClose={()=>setSnackOpen(false)}/>
    </div>
  );
};

export default AssetManagement;
