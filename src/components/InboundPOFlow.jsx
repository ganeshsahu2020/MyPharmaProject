// Pro-level inbound flow diagram for a PO, aligned to get_inbound_flow_by_po JSONB.
// - React + Tailwind only (no external graph libs)
// - Pannable/zoomable SVG, orientation toggle, SVG export
// - Click a stage node to see its row-level details below
// - Status coloring consistent with your app palette
// - QC rollups, KPIs, auto-refresh, copy deep-link

import React,{useCallback,useEffect,useMemo,useRef,useState} from "react";
import {supabase} from "../utils/supabaseClient";
import {
  ChevronDown,ChevronRight,Maximize2,Download,RefreshCw,Link as LinkIcon,RotateCw,Filter
} from "lucide-react";

/* ================= status helpers ================= */
const STATUS_ORDER={closed:4,done:4,posted:4,accepted:4,approved:4,completed:4,open:3,"in transit":2,in_transit:2,draft:2,created:2,review:2,"in review":2};
const rankStatus=(s)=>{const v=String(s||"").toLowerCase();if(v in STATUS_ORDER) return STATUS_ORDER[v];if(v.includes("transit")) return 2;return 1;};

const isClosedLike = (s)=>/(closed|done|posted|accepted|approved|completed)/i.test(String(s||""));
const isCompletedLike = (s)=>/(completed|closed|done|posted|accepted|approved)/i.test(String(s||""));
const isOpenLike = (s)=>/open/i.test(String(s||""));

const statusColor=(s)=>{
  const v=String(s||"").toLowerCase();
  if(["closed","done","posted","accepted","approved","completed"].includes(v)) return "#059669"; // emerald
  if(v==="open") return "#2563eb"; // blue
  if(v.includes("transit")||v==="draft"||v==="created"||v.includes("review")||v==="in-process"||v==="in process") return "#d97706"; // amber
  if(v==="cancelled"||v==="canceled"||v==="rejected") return "#dc2626"; // rose
  return "#6b7280"; // slate
};
const chipBg=(s)=>{
  const v=statusColor(s);
  if(v==="#059669") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if(v==="#2563eb") return "bg-blue-50 text-blue-700 border-blue-200";
  if(v==="#d97706") return "bg-amber-50 text-amber-800 border-amber-200";
  if(v==="#dc2626") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
};

/* ================= fixed stage order (aligned to SQL) ================= */
const STAGES=[
  {key:"gate_entry",label:"Gate Entry"},
  {key:"vehicle_inspection",label:"Vehicle Inspection"},
  {key:"material_inspection",label:"Material Inspection"},
  {key:"weight_capture",label:"Weight Capture"},
  {key:"grn_posting",label:"GRN Posting"},
  {key:"label_printing",label:"Label Printing"},
  {key:"palletization",label:"Palletization"}
];

/* ================= small utils ================= */
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const round2=(n)=>Math.round(n*100)/100;
const fmtDT=(s)=>{if(!s) return "-";try{const d=new Date(s);return Number.isNaN(d.getTime())?String(s):d.toLocaleString();}catch{return String(s);}};
const fmtNum=(n,dec=3)=>n==null?"-":Number(n).toFixed(dec);
const toStr=(v)=>String(v??"").trim();

/* ================= layout helpers ================= */
const layoutHorizontal=(names,w,h,pad=64)=>{
  const N=Math.max(1,names.length);
  const left=pad,right=Math.max(pad+1,w-pad);
  const usable=Math.max(1,right-left);
  const midY=Math.round(h/2);
  const map=new Map();
  names.forEach((name,i)=>{
    const x=Math.round(left+(N===1?usable/2:(usable*i)/(N-1)));
    map.set(name,{x,y:midY});
  });
  return map;
};
const layoutVertical=(names,w,h,{padX=64,padTop=48,padBottom=48})=>{
  const N=Math.max(1,names.length);
  const innerW=Math.max(1,w-padX*2);
  const step=Math.max(1,innerW/(N-1||1));
  const xs=[...Array(N)].map((_,i)=>Math.round(padX+step*i));
  const map=new Map();
  const innerH=Math.max(1,h-padTop-padBottom);
  const mid=Math.round(padTop+innerH/2);
  names.forEach((name,i)=>map.set(name,{x:xs[i],y:mid}));
  return map;
};

/* ======= derived/effective status helpers (from returned rows) ======= */
function hasAnyPalletizationIn(stageMap){
  const rows = stageMap.get("palletization")?.rows || [];
  if (rows.some(r=>/\bIN\b/i.test(String(r.status||"")))) return true;
  return rows.length > 0;
}
function anyGrnPosted(stageMap){
  const rows = stageMap.get("grn_posting")?.rows || [];
  return rows.length > 0;
}
function derivedWeightCaptureStatus(stageMap){
  const s = stageMap.get("weight_capture") || {};
  const rows = s.rows || [];
  if (!rows.length) return s.status || "Open";
  const headers = rows.map(r=>String(r.header_status||""));
  if (headers.every(h=>/(completed|closed|done)/i.test(h))) return "Completed";
  if (headers.some(h=>/(completed|closed|done)/i.test(h))) return "In-Process";
  return s.status || "Open";
}
function derivedEffectiveStatus(key, rawStatus, stageMap){
  const palletDone = hasAnyPalletizationIn(stageMap);
  const grnDone = anyGrnPosted(stageMap);

  // ✅ Autoclose Gate & Weight once GRN is posted OR Palletization is done
  if ((grnDone || palletDone) && (key==="gate_entry" || key==="weight_capture")) {
    return "Closed";
  }

  if (key==="weight_capture") {
    return derivedWeightCaptureStatus(stageMap);
  }

  if (key==="grn_posting") {
    const rows = stageMap.get("grn_posting")?.rows || [];
    if (rows.length > 0 && !isClosedLike(rawStatus)) return "Posted";
  }

  if (key==="label_printing") {
    const rows = stageMap.get("label_printing")?.rows || [];
    if (rows.length > 0 && !isCompletedLike(rawStatus)) return "Completed";
  }

  if (key==="palletization") {
    const rows = stageMap.get("palletization")?.rows || [];
    if (rows.length > 0 && !isCompletedLike(rawStatus)) return "Completed";
  }

  return rawStatus || "Open";
}

/* ================= main component ================= */
export default function InboundPOFlow({
  poNo,
  orientation="horizontal",
  stageHeightVh=52,
  autoFetch=true,
  showExport=true
}){
  const wrapperRef=useRef(null);const svgRef=useRef(null);const gRef=useRef(null);
  const [size,setSize]=useState({w:900,h:360});
  const [view,setView]=useState({tx:0,ty:0,k:1});
  const [dir,setDir]=useState(orientation==="vertical"?"vertical":"horizontal");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [flow,setFlow]=useState(null);
  const [activeStage,setActiveStage]=useState("");
  const [onlyOpen,setOnlyOpen]=useState(false);
  const [autoRefresh,setAutoRefresh]=useState(false);

  /* measure */
  useEffect(()=>{
    const el=wrapperRef.current;if(!el) return;
    const ro=new ResizeObserver(()=>{
      const r=el.getBoundingClientRect();
      setSize({w:Math.max(420,r.width),h:Math.max(260,r.height)});
    });
    ro.observe(el);
    return()=>ro.disconnect();
  },[]);

  /* fetch */
  const fetchFlow=useCallback(async()=>{
    if(!poNo){setFlow(null);setError("");return;}
    setLoading(true);setError("");
    const {data,error}=await supabase.rpc("get_inbound_flow_by_po",{p_po_no:poNo});
    if(error){setError(error.message||"Failed to load flow");setFlow(null);}
    else {setFlow(data||null);}
    setLoading(false);
  },[poNo]);
  useEffect(()=>{if(autoFetch) fetchFlow();},[fetchFlow,autoFetch]);

  // optional auto-refresh every 10s
  useEffect(()=>{
    if(!autoRefresh) return;
    const id=setInterval(()=>{fetchFlow();},10000);
    return()=>clearInterval(id);
  },[autoRefresh,fetchFlow]);

  /* graph data from flow */
  const stageSummaries=useMemo(()=>{
    const s=flow?.stages||{};
    const out={};
    STAGES.forEach(({key})=>{
      const j=s[key]||{};
      out[key]={
        status:j.status||"Open",
        closed_at: j.closed_at || null,
        done_by:j.done_by||null,
        rows:Array.isArray(j.rows)?j.rows:[],
      };
    });
    return out;
  },[flow]);

  // Map for easy per-stage lookup
  const stageMap=useMemo(()=>{
    const map=new Map();
    STAGES.forEach(st=>map.set(st.key,stageSummaries[st.key]||{status:"Open",rows:[]}));
    return map;
  },[stageSummaries]);

  const nodeNames=useMemo(()=>STAGES.map((s)=>s.label),[]);
  const positions=useMemo(()=>{
    if(dir==="vertical") return layoutVertical(nodeNames,size.w,size.h,{padX:72,padTop:36,padBottom:36});
    return layoutHorizontal(nodeNames,size.w,size.h,72);
  },[nodeNames,size.w,size.h,dir]);

  const nodeRects=useMemo(()=>{
    const w=170,h=56;
    return nodeNames.map((name)=>{
      const p=positions.get(name)||{x:0,y:0};
      return {name,x:p.x-w/2,y:p.y-h/2,cx:p.x,cy:p.y,width:w,height:h};
    });
  },[nodeNames,positions]);

  const edges=useMemo(()=>{
    const arr=[];
    for(let i=0;i<nodeRects.length-1;i++){
      const a=nodeRects[i],b=nodeRects[i+1];
      arr.push({id:`${a.name}->${b.name}`,from:a,to:b});
    }
    return arr;
  },[nodeRects]);

  /* fit */
  const fitToView=useCallback(()=>{
    const svg=svgRef.current,g=gRef.current;if(!svg||!g) return;
    try{
      const bb=g.getBBox();
      const pad=32;
      const scale=Math.min(size.w/Math.max(1,bb.width+pad*2),size.h/Math.max(1,bb.height+pad*2));
      const cx=bb.x+bb.width/2;const cy=bb.y+bb.height/2;
      const tx=size.w/2-scale*cx;const ty=size.h/2-scale*cy;
      setView({k:round2(scale),tx:round2(tx),ty:round2(ty)});
    }catch{};
  },[size.w,size.h]);
  useEffect(()=>{const id=setTimeout(fitToView,60);return()=>clearTimeout(id);},[fitToView,nodeRects.length,dir]);

  /* pan */
  useEffect(()=>{
    const el=wrapperRef.current;if(!el) return;
    let dragging=false,sx=0,sy=0,start={tx:0,ty:0};
    const down=(e)=>{dragging=true;sx=e.clientX??(e.touches?.[0]?.clientX||0);sy=e.clientY??(e.touches?.[0]?.clientY||0);start={tx:view.tx,ty:view.ty};e.preventDefault();};
    const move=(e)=>{if(!dragging) return;const cx=e.clientX??(e.touches?.[0]?.clientX||0);const cy=e.clientY??(e.touches?.[0]?.clientY||0);setView((v)=>({...v,tx:start.tx+(cx-sx),ty:start.ty+(cy-sy)}));};
    const up=()=>{dragging=false;};
    el.addEventListener("mousedown",down);el.addEventListener("mousemove",move);window.addEventListener("mouseup",up);
    el.addEventListener("touchstart",down,{passive:false});el.addEventListener("touchmove",move,{passive:false});window.addEventListener("touchend",up);
    return()=>{
      el.removeEventListener("mousedown",down);el.removeEventListener("mousemove",move);window.removeEventListener("mouseup",up);
      el.removeEventListener("touchstart",down);el.removeEventListener("touchmove",move);window.removeEventListener("touchend",up);
    };
  },[view.tx,view.ty]);

  /* wheel zoom */
  useEffect(()=>{
    const el=wrapperRef.current;if(!el) return;
    const onWheel=(e)=>{
      e.preventDefault();
      const factor=Math.pow(1.0015,e.deltaY);
      setView((v)=>{
        const rect=el.getBoundingClientRect();
        const px=e.clientX-rect.left;const py=e.clientY-rect.top;
        const nk=clamp(v.k/factor,0.25,5);
        const dx=px-v.tx;const dy=py-v.ty;
        const tx=px-(dx*nk)/v.k;const ty=py-(dy*nk)/v.k;
        return {k:round2(nk),tx:round2(tx),ty:round2(ty)};
      });
    };
    el.addEventListener("wheel",onWheel,{passive:false});
    return()=>el.removeEventListener("wheel",onWheel);
  },[]);

  /* export */
  const exportSvg=useCallback(()=>{
    try{
      const svg=svgRef.current;if(!svg) return;
      const clone=svg.cloneNode(true);
      clone.setAttribute("xmlns","http://www.w3.org/2000/svg");
      const s=new XMLSerializer().serializeToString(clone);
      const blob=new Blob([s],{type:"image/svg+xml;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;a.download=`inbound-flow-${poNo||"PO"}.svg`;
      a.click();URL.revokeObjectURL(url);
    }catch{};
  },[poNo]);

  /* derive per-stage props (raw + effective) */
  const stageCards=useMemo(()=>{
    const map=new Map();
    STAGES.forEach((s)=>{
      const raw = stageMap.get(s.key) || {status:"Open",rows:[]};
      const effective = derivedEffectiveStatus(s.key, raw.status, stageMap);
      map.set(s.key,{...s,...raw,effectiveStatus: effective});
    });
    return map;
  },[stageMap]);

  /* ---- KPIs & QC rollups ---- */
  const kpis=useMemo(()=>{
    const gate = stageCards.get("gate_entry")?.rows||[];
    const veh  = stageCards.get("vehicle_inspection")?.rows||[];
    const mat  = stageCards.get("material_inspection")?.rows||[];
    const wc   = stageCards.get("weight_capture")?.rows||[];
    const grn  = stageCards.get("grn_posting")?.rows||[];
    const lbl  = stageCards.get("label_printing")?.rows||[];
    const pal  = stageCards.get("palletization")?.rows||[];

    const labelsPrinted = lbl.length;
    const grnsPosted = grn.length;
    const pallets = new Set(pal.map(r=>`${r.uid}`)).size;
    const qcPending = pal.filter(r=>!/(accepted|approved|cleared|released)/i.test(String(r.qc_status||""))).length;
    const containersLive = pal.reduce((a,r)=>a+(Number(r.live_containers||0)),0);
    const totalStages = STAGES.length;
    const closedStages = STAGES
      .map(st => stageCards.get(st.key)?.effectiveStatus || "Open")
      .filter(s => isClosedLike(s) || /completed|posted/i.test(String(s))).length;
    const progressPct = totalStages ? Math.round((closedStages/totalStages)*100) : 0;

    return {labelsPrinted,grnsPosted,pallets,qcPending,containersLive,progressPct};
  },[stageCards]);

  const summary=flow?.summary||null;

  const copyDeepLink=useCallback(async()=>{
    try{
      if(!poNo) return;
      const url=new URL(window.location.href);
      url.searchParams.set("po",poNo);
      await navigator.clipboard.writeText(url.toString());
    }catch{}
  },[poNo]);

  return (
    <div className="relative">
      {/* Header band */}
      <div className="rounded-xl overflow-hidden border shadow-sm mb-3">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 px-4 py-3 text-white flex items-center gap-3 flex-wrap">
          <div className="text-sm md:text-base font-semibold tracking-tight">Inbound Process Flow</div>
          {poNo && <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/15 border border-white/30">PO: <b>{poNo}</b></span>}
          <div className="ml-auto flex items-center gap-2">
            <label className="text-[12px] inline-flex items-center gap-1">
              <span className="opacity-90">Dir</span>
              <select value={dir} onChange={(e)=>setDir(e.target.value)} className="text-[12px] bg-white/10 border border-white/30 rounded px-1 py-0.5 ml-1">
                <option value="horizontal">horizontal</option>
                <option value="vertical">vertical</option>
              </select>
            </label>
            <button type="button" onClick={exportSvg} className="text-xs px-2 py-1 rounded-md bg-white/10 border border-white/30 hover:bg-white/20 flex items-center gap-1" title="Download as SVG">
              <Download size={14}/> Export
            </button>
            <button type="button" onClick={fitToView} className="text-xs px-2 py-1 rounded-md bg-white/10 border border-white/30 hover:bg-white/20 flex items-center gap-1" title="Fit to view">
              <Maximize2 size={14}/> Fit
            </button>
            <button type="button" onClick={fetchFlow} disabled={loading} className="text-xs px-2 py-1 rounded-md bg-white/10 border border-white/30 hover:bg-white/20 flex items-center gap-1 disabled:opacity-50" title="Reload">
              <RefreshCw size={14} className={loading?"animate-spin":""}/> Reload
            </button>
            <label className="text-[12px] inline-flex items-center gap-1 ml-1">
              <input type="checkbox" className="accent-white" checked={autoRefresh} onChange={(e)=>setAutoRefresh(e.target.checked)}/>
              Auto
            </label>
            <button type="button" onClick={copyDeepLink} disabled={!poNo} className="text-xs px-2 py-1 rounded-md bg-white/10 border border-white/30 hover:bg-white/20 flex items-center gap-1 disabled:opacity-40" title="Copy deep link">
              <LinkIcon size={14}/> Link
            </button>
          </div>
        </div>

        {/* KPI row */}
        <div className="bg-white px-4 py-3 grid grid-cols-2 md:grid-cols-5 gap-2">
          <Kpi label="Progress" value={`${kpis.progressPct}%`}>
            <div className="w-full h-1.5 bg-slate-200 rounded">
              <div className="h-1.5 bg-blue-600 rounded" style={{width:`${kpis.progressPct}%`}}/>
            </div>
          </Kpi>
          <Kpi label="GRNs Posted" value={kpis.grnsPosted}/>
          <Kpi label="Labels Printed" value={kpis.labelsPrinted}/>
          <Kpi label="Pallets" value={kpis.pallets}/>
          <Kpi label="QC Pending" value={kpis.qcPending} tone={kpis.qcPending? "warn":"ok"}/>
        </div>
      </div>

      {/* Small legend */}
      <div className="flex items-center gap-3 text-[11px] text-slate-600 mb-2">
        <LegendSwatch c="#2563eb" t="Open"/>
        <LegendSwatch c="#d97706" t="In-Process/Review"/>
        <LegendSwatch c="#059669" t="Completed/Posted/Closed"/>
        <LegendSwatch c="#dc2626" t="Rejected/Cancelled"/>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-[11px] inline-flex items-center gap-1"><Filter size={12}/><input type="checkbox" className="mr-1" checked={onlyOpen} onChange={(e)=>setOnlyOpen(e.target.checked)}/> Only open/pending rows</label>
        </div>
      </div>

      {/* Canvas */}
      <div ref={wrapperRef} style={{height:`${stageHeightVh}vh`,touchAction:"none"}} className="w-full bg-white border rounded-xl overflow-hidden shadow-sm" onDoubleClick={fitToView}>
        <svg ref={svgRef} width="100%" height="100%">
          <defs>
            <marker id="arrow" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto">
              <polygon points="0,0 12,4 0,8" fill="#94a3b8"/>
            </marker>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <linearGradient id="nodeGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#ffffff"/>
              <stop offset="100%" stopColor="#f8fafc"/>
            </linearGradient>
          </defs>

          <g ref={gRef} transform={`translate(${view.tx},${view.ty}) scale(${view.k})`}>
            {/* edges */}
            {edges.map((e)=>{
              const d=`M ${e.from.cx} ${e.from.cy} C ${e.from.cx+(dir==="horizontal"?60:0)} ${e.from.cy}, ${e.to.cx-(dir==="horizontal"?60:0)} ${e.to.cy}, ${e.to.cx} ${e.to.cy}`;
              return <path key={e.id} d={d} fill="none" stroke="#94a3b8" strokeWidth={2} markerEnd="url(#arrow)"/>;
            })}

            {/* nodes */}
            {nodeRects.map((n,idx)=>{
              const stage=STAGES[idx];
              const s=stageCards.get(stage.key)||{};
              const eff = s.effectiveStatus || s.status || "Open";
              const color=statusColor(eff);
              const active=activeStage===stage.key;
              const border=active?"#1d4ed8":"#94a3b8";const sw=active?2.5:1.6;
              return (
                <g key={n.name} transform={`translate(${n.x},${n.y})`} onClick={()=>setActiveStage((cur)=>cur===stage.key?"":stage.key)} className="cursor-pointer" filter={active?"url(#glow)":undefined}>
                  <rect width={n.width} height={n.height} rx={14} ry={14} fill="url(#nodeGrad)" stroke={border} strokeWidth={sw}/>
                  {/* left status pill */}
                  <g transform="translate(10,10)"><rect width={10} height={10} rx={2} ry={2} fill={color}/></g>
                  {/* step bubble */}
                  <g transform="translate(28,14)">
                    <circle r={10} cx={0} cy={0} fill="#1d4ed8"/>
                    <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="#fff">{idx+1}</text>
                  </g>
                  {/* title */}
                  <text x={n.width/2} y={22} textAnchor="middle" fontSize={13} fill="#0f172a">{n.name}</text>
                  {/* status */}
                  <text x={n.width/2} y={40} textAnchor="middle" fontSize={11} fill={color}>{eff}</text>
                </g>
              );
            })}
          </g>
        </svg>
        {!poNo&&(
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-sm text-slate-500 bg-white/90 px-3 py-1.5 rounded-md border">Enter a PO to view its flow.</div>
          </div>
        )}
        {loading&&(
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="px-3 py-2 text-sm rounded-md border bg-white shadow-sm animate-pulse">Loading flow…</div>
          </div>
        )}
        {error&&(
          <div className="absolute inset-x-0 bottom-2 mx-auto w-fit px-3 py-1.5 text-xs rounded-md border border-rose-200 bg-rose-50 text-rose-700">{error}</div>
        )}
      </div>

      {/* === Stage detail tables === */}
      {STAGES.map((st)=>{
        const s=stageCards.get(st.key)||{};
        const open=activeStage===st.key;
        let rows=s.rows||[];
        if(onlyOpen){
          rows = rows.filter(r=>{
            const status = r.status || r.overall_status || r.header_status || r.gate_status || "";
            return !isClosedLike(status) && !/(posted|completed|closed|done|accepted|approved)/i.test(String(status));
          });
        }
        const eff = s.effectiveStatus || s.status || "Open";
        return (
          <div key={st.key} className="mt-3 border rounded-xl overflow-hidden bg-white shadow-sm">
            <button type="button" onClick={()=>setActiveStage((cur)=>cur===st.key?"":st.key)} className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 border-b">
              <div className="flex items-center gap-2 text-sm">
                <span className={`px-2 py-0.5 rounded-full border ${chipBg(eff)}`}>{eff}</span>
                <span className="font-semibold">{st.label}</span>
                {s.done_by&&<span className="text-slate-500 text-xs">by {toStr(s.done_by)}</span>}
                {s.closed_at&&<span className="text-slate-500 text-xs">@ {fmtDT(s.closed_at)}</span>}
                <span className="text-slate-500 text-xs">({rows.length} row{rows.length===1?"":"s"})</span>
              </div>
              {open?<ChevronDown size={16}/>:<ChevronRight size={16}/>}
            </button>

            {open&&(
              <div className="overflow-x-auto">
                {st.key==="gate_entry"&&<GateTable rows={rows}/>}
                {st.key==="vehicle_inspection"&&<VehTable rows={rows}/>}
                {st.key==="material_inspection"&&<MatTable rows={rows}/>}
                {st.key==="weight_capture"&&<WCTable rows={rows}/>}
                {st.key==="grn_posting"&&<GrnTable rows={rows}/>}
                {st.key==="label_printing"&&<LblTable rows={rows}/>}
                {st.key==="palletization"&&<PalTable rows={rows}/>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* --------- small bits --------- */
function Kpi({label,value,children,tone}){
  const toneCls = tone==="warn" ? "text-amber-700 bg-amber-50 border-amber-200"
                 : tone==="ok"   ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                 : "text-slate-700 bg-slate-50 border-slate-200";
  return (
    <div className={`rounded-lg border px-3 py-2 ${toneCls}`}>
      <div className="text-[11px] uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold leading-tight">{value ?? "-"}</div>
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}
const LegendSwatch=({c,t})=>(
  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-[3px]" style={{background:c}}/> {t}</span>
);

/* ================= tables per stage (lean columns; 3-decimal numeric) ================= */
const GateTable=({rows})=>(
  <table className="min-w-[1150px] w-full text-sm">
    <thead className="bg-slate-50 text-slate-700">
      <tr>
        <th className="text-left px-3 py-2 border-b">Gate Pass</th>
        <th className="text-left px-3 py-2 border-b">POs</th>
        <th className="text-left px-3 py-2 border-b">Invoices</th>
        <th className="text-left px-3 py-2 border-b">Transporter</th>
        <th className="text-left px-3 py-2 border-b">LR</th>
        <th className="text-left px-3 py-2 border-b">Vehicle</th>
        <th className="text-left px-3 py-2 border-b">Delivery Note</th>
        <th className="text-left px-3 py-2 border-b">Status</th>
        <th className="text-left px-3 py-2 border-b">Created</th>
        <th className="text-left px-3 py-2 border-b">Updated</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((r,i)=>(
        <tr key={i} className="odd:bg-white even:bg-slate-50/40">
          <td className="px-3 py-2 border-b font-mono text-xs">{toStr(r.gate_pass_no)}</td>
          <td className="px-3 py-2 border-b">{Array.isArray(r.po_list)?r.po_list.join(", "):"-"}</td>
          <td className="px-3 py-2 border-b">{Array.isArray(r.invoice_list)?r.invoice_list.join(", "):"-"}</td>
          <td className="px-3 py-2 border-b">{toStr(r.transporter)||"-"}</td>
          <td className="px-3 py-2 border-b">{toStr(r.lr_no)||"-"}</td>
          <td className="px-3 py-2 border-b">{toStr(r.vehicle_no)||"-"}</td>
          <td className="px-3 py-2 border-b">{toStr(r.delivery_note)||"-"}</td>
          <td className="px-3 py-2 border-b" style={{color:statusColor(r.gate_status)}}>{toStr(r.gate_status)||"-"}</td>
          <td className="px-3 py-2 border-b">{fmtDT(r.created_at)}</td>
          <td className="px-3 py-2 border-b">{fmtDT(r.updated_at)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const VehTable=({rows})=>(
  <table className="min-w-[900px] w-full text-sm">
    <thead className="bg-slate-50 text-slate-700">
      <tr>
        <th className="text-left px-3 py-2 border-b">Gate Pass</th>
        <th className="text-left px-3 py-2 border-b">Status</th>
        <th className="text-left px-3 py-2 border-b">Overall</th>
        <th className="text-left px-3 py-2 border-b">QA User</th>
        <th className="text-left px-3 py-2 border-b">Decided</th>
        <th className="text-left px-3 py-2 border-b">Updated</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((r,i)=>(
        <tr key={i} className="odd:bg-white even:bg-slate-50/40">
          <td className="px-3 py-2 border-b font-mono text-xs">{toStr(r.gate_pass_no)}</td>
          <td className="px-3 py-2 border-b" style={{color:statusColor(r.status)}}>{toStr(r.status)||"-"}</td>
          <td className="px-3 py-2 border-b">{toStr(r.overall_status)||"-"}</td>
          <td className="px-3 py-2 border-b">{toStr(r.qa_user_email)||toStr(r.qa_user_id)||"-"}</td>
          <td className="px-3 py-2 border-b">{fmtDT(r.qa_decided_at)}</td>
          <td className="px-3 py-2 border-b">{fmtDT(r.updated_at)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const MatTable=({rows})=>(
  <table className="min-w-[900px] w-full text-sm">
    <thead className="bg-slate-50 text-slate-700">
      <tr>
        <th className="text-left px-3 py-2 border-b">Gate Pass</th>
        <th className="text-left px-3 py-2 border-b">Status</th>
        <th className="text-left px-3 py-2 border-b">Overall</th>
        <th className="text-left px-3 py-2 border-b">QA User</th>
        <th className="text-left px-3 py-2 border-b">Decided</th>
        <th className="text-left px-3 py-2 border-b">Updated</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((r,i)=>(
        <tr key={i} className="odd:bg-white even:bg-slate-50/40">
          <td className="px-3 py-2 border-b font-mono text-xs">{toStr(r.gate_pass_no)}</td>
          <td className="px-3 py-2 border-b" style={{color:statusColor(r.status)}}>{toStr(r.status)||"-"}</td>
          <td className="px-3 py-2 border-b">{toStr(r.overall_status)||"-"}</td>
          <td className="px-3 py-2 border-b">{toStr(r.qa_user_email)||toStr(r.qa_user_id)||"-"}</td>
          <td className="px-3 py-2 border-b">{fmtDT(r.qa_decided_at)}</td>
          <td className="px-3 py-2 border-b">{fmtDT(r.updated_at)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const WCTable=({rows})=>(
  <table className="min-w-[1400px] w-full text-sm">
    <thead className="bg-slate-50 text-slate-700">
      <tr>
        <th className="text-left px-3 py-2 border-b">Material</th>
        <th className="text-left px-3 py-2 border-b">PO Qty</th>
        <th className="text-left px-3 py-2 border-b">Recv Qty</th>
        <th className="text-left px-3 py-2 border-b">Containers</th>
        <th className="text-left px-3 py-2 border-b">Captured</th>
        <th className="text-left px-3 py-2 border-b">Good</th>
        <th className="text-left px-3 py-2 border-b">Damage</th>
        <th className="text-left px-3 py-2 border-b">Status</th>
        <th className="text-left px-3 py-2 border-b">Done By</th>
        <th className="text-left px-3 py-2 border-b">Done At</th>
        <th className="text-left px-3 py-2 border-b">Invoice</th>
        <th className="text-left px-3 py-2 border-b">WC No</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((r,i)=>(
        <tr key={i} className="odd:bg-white even:bg-slate-50/40">
          <td className="px-3 py-2 border-b">
            <div className="font-medium">{toStr(r.material_code)}</div>
            <div className="text-xs text-slate-600">{toStr(r.material_desc)}</div>
          </td>
          <td className="px-3 py-2 border-b">{fmtNum(r.po_qty)} {toStr(r.uom)}</td>
          <td className="px-3 py-2 border-b">{fmtNum(r.recv_qty)} {toStr(r.uom)}</td>
          <td className="px-3 py-2 border-b">{r.containers??"-"}</td>
          <td className="px-3 py-2 border-b">{fmtNum(r.captured_weight_qty)} {toStr(r.uom)}</td>
          <td className="px-3 py-2 border-b">{fmtNum(r.good_qty)} {toStr(r.uom)}</td>
          <td className="px-3 py-2 border-b">{fmtNum(r.damage_qty)} {toStr(r.uom)}</td>
          <td className="px-3 py-2 border-b" style={{color:statusColor(r.header_status)}}>{toStr(r.header_status)||"-"}</td>
          <td className="px-3 py-2 border-b">{toStr(r.done_by)||"-"}</td>
          <td className="px-3 py-2 border-b">{fmtDT(r.done_at)}</td>
          <td className="px-3 py-2 border-b">{toStr(r.invoice_no)||"-"}</td>
          <td className="px-3 py-2 border-b">{toStr(r.wc_no)||"-"}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const GrnTable=({rows})=>(
  <table className="min-w-[1200px] w-full text-sm">
    <thead className="bg-slate-50 text-slate-700">
      <tr>
        <th className="text-left px-3 py-2 border-b">GRN</th>
        <th className="text-left px-3 py-2 border-b">Line</th>
        <th className="text-left px-3 py-2 border-b">Item</th>
        <th className="text-left px-3 py-2 border-b">Material</th>
        <th className="text-left px-3 py-2 border-b">Qty</th>
        <th className="text-left px-3 py-2 border-b">Containers</th>
        <th className="text-left px-3 py-2 border-b">Insp Lot</th>
        <th className="text-left px-3 py-2 border-b">Batch</th>
        <th className="text-left px-3 py-2 border-b">Invoice</th>
        <th className="text-left px-3 py-2 border-b">Posted By</th>
        <th className="text-left px-3 py-2 border-b">Posted At</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((r,i)=>(
        <tr key={i} className="odd:bg-white even:bg-slate-50/40">
          <td className="px-3 py-2 border-b">{toStr(r.grn_no)}</td>
          <td className="px-3 py-2 border-b">{r.line??r.line_no??"-"}</td>
          <td className="px-3 py-2 border-b">{toStr(r.item_code)||"-"}</td>
          <td className="px-3 py-2 border-b">
            <div className="font-medium">{toStr(r.material_code)}</div>
            <div className="text-xs text-slate-600">{toStr(r.material_desc)}</div>
          </td>
          <td className="px-3 py-2 border-b">{fmtNum(r.net_qty)} {toStr(r.uom)}</td>
          <td className="px-3 py-2 border-b">{r.containers??r.num_containers??"-"}</td>
          <td className="px-3 py-2 border-b">{toStr(r.inspection_lot_no)||"-"}</td>
          <td className="px-3 py-2 border-b">{toStr(r.item_batch)||"-"}</td>
          <td className="px-3 py-2 border-b">{toStr(r.invoice_no)||"-"}</td>
          <td className="px-3 py-2 border-b">{toStr(r.posted_by)||"-"}</td>
          <td className="px-3 py-2 border-b">{fmtDT(r.posted_at)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const LblTable=({rows})=>(
  <table className="min-w-[1100px] w-full text-sm">
    <thead className="bg-slate-50 text-slate-700">
      <tr>
        <th className="text-left px-3 py-2 border-b">UID</th>
        <th className="text-left px-3 py-2 border-b">Label Qty</th>
        <th className="text-left px-3 py-2 border-b">Containers</th>
        <th className="text-left px-3 py-2 border-b">UOM</th>
        <th className="text-left px-3 py-2 border-b">Printed By</th>
        <th className="text-left px-3 py-2 border-b">Printed At</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((r)=>{
        const key=`${r.uid}:${r.container_index??""}`;
        return (
          <tr key={key} className="odd:bg-white even:bg-slate-50/40">
            <td className="px-3 py-2 border-b font-mono text-xs">{toStr(r.uid)}</td>
            <td className="px-3 py-2 border-b">{fmtNum(r.net_qty??r.qty)}</td>
            <td className="px-3 py-2 border-b">{r.num_containers??"-"}</td>
            <td className="px-3 py-2 border-b">{toStr(r.uom)}</td>
            <td className="px-3 py-2 border-b">{toStr(r.printed_by)||"-"}</td>
            <td className="px-3 py-2 border-b">{fmtDT(r.printed_at)}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

const PalTable=({rows})=>(
  <table className="min-w-[1200px] w-full text-sm">
    <thead className="bg-slate-50 text-slate-700">
      <tr>
        <th className="text-left px-3 py-2 border-b">UID</th>
        <th className="text-left px-3 py-2 border-b">Location</th>
        <th className="text-left px-3 py-2 border-b">Status</th>
        <th className="text-left px-3 py-2 border-b">Live Qty</th>
        <th className="text-left px-3 py-2 border-b">Containers</th>
        <th className="text-left px-3 py-2 border-b">Updated</th>
        <th className="text-left px-3 py-2 border-b">QC</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((r)=>{
        const key=`${r.uid}:${r.location_code}:${r.updated_at}`;
        return (
          <tr key={key} className="odd:bg-white even:bg-slate-50/40">
            <td className="px-3 py-2 border-b font-mono text-xs">{toStr(r.uid)}</td>
            <td className="px-3 py-2 border-b">{toStr(r.location_code)}</td>
            <td className="px-3 py-2 border-b" style={{color:statusColor(r.status)}}>{toStr(r.status)||"-"}</td>
            <td className="px-3 py-2 border-b">{fmtNum(r.live_qty)} {toStr(r.uom)}</td>
            <td className="px-3 py-2 border-b">{r.live_containers??"-"}</td>
            <td className="px-3 py-2 border-b">{fmtDT(r.updated_at)}</td>
            <td className="px-3 py-2 border-b">{toStr(r.qc_status)||"-"}{r.qc_updated?` @ ${fmtDT(r.qc_updated)}`:""}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

/* ================= usage =================
import InboundPOFlow from "./components/InboundPOFlow";
<InboundPOFlow poNo="PO/25/000123" />
======================================== */
