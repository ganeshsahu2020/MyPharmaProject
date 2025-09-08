// src/components/AiReport.jsx
import React,{useRef,useState} from "react";
import {
  Sparkles,Bot,FileText,Download,Loader2,GitBranch,Info,Mic,Square,Languages,Pause,Play
} from "lucide-react";
import {Card,CardContent,CardHeader,CardTitle} from "./ui/card";
import Button from "./ui/Button";
import AIChatPanel from "./AIChatPanel";
import InboundPOFlow from "./InboundPOFlow";
import logo from "../assets/logo.png";

import * as QV from "../hooks/useQuickVoice";
import {supabase} from "../utils/supabaseClient";

/* ✅ New helpers */
import {resolveAnyToPO,getFlowFactsForPO} from "../data/flowFacts";

/* ---------- config ---------- */
const AI_BASE=import.meta.env.VITE_SUPABASE_URL||"";
const AI_ENDPOINT=AI_BASE+(import.meta.env.VITE_AI_ENDPOINT||"/functions/v1/ai-ask");

/* ---------- tiny md -> html (lite) ---------- */
const esc=(s)=>String(s||"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const mdToHtml=(raw)=>{
  let s=esc(raw||"");
  s=s.replace(/```(\w+)?\n([\s\S]*?)```/g,(m,lang,code)=>`<pre class="dx-pre"><code data-lang="${lang||""}">${code.replace(/\n/g,"<br/>").trim()}</code></pre>`);
  s=s
    .replace(/^######\s?(.*)$/gm,"<h6>$1</h6>")
    .replace(/^#####\s?(.*)$/gm,"<h5>$1</h5>")
    .replace(/^####\s?(.*)$/gm,"<h4>$1</h4>")
    .replace(/^###\s?(.*)$/gm,"<h3>$1</h3>")
    .replace(/^##\s?(.*)$/gm,"<h2>$1</h2>")
    .replace(/^#\s?(.*)$/gm,"<h1>$1</h1>")
    .replace(/\*\*([^*]+)\*\*/g,"<b>$1</b>")
    .replace(/\*([^*]+)\*/g,"<i>$1</i>")
    .replace(/\n{2,}/g,"</p><p>")
    .replace(/^(?!<h\d|<pre|<p|<\/p>)(.+)$/gm,"<p>$1</p>")
    .replace(/\n/g,"<br/>");
  return s;
};

/* ---------- strip any machine JSON from visible text ---------- */
const stripMachinePayloads=(s)=>{
  let out=String(s||"");
  out=out.replace(/```(?:json|flow)[\s\S]*?```/gi,"");
  out=out.replace(/\n?flow\s*\{[\s\S]*\}\s*$/i,"");
  out=out.replace(/\n?\{\s*"?(?:flow|logs)"?\s*:[\s\S]*\}\s*$/i,"");
  return out.trim();
};

/* ---------- voice (mic capture for commands) ---------- */
const LOCALES=[{v:"en-IN",label:"English (India)"},{v:"en-US",label:"English (US)"},{v:"en-GB",label:"English (UK)"}];
const TONES={neutral:{rate:1,pitch:1,volume:1},friendly:{rate:1.06,pitch:1.08,volume:1},formal:{rate:0.95,pitch:0.9,volume:1}};
const useVoiceShim=()=>{const impl=QV.useQuickVoice||QV.default||(()=>({state:{isRecording:false,transcript:"",error:""},setConfig:()=>{},start:()=>{},stop:(cb)=>cb?.("")}));return impl();};

/* ---------- TTS helpers ---------- */
const mdToPlain=(md="")=>String(md||"")
  .replace(/^#{1,6}\s*/gm,"")
  .replace(/```[\s\S]*?```/g,"")
  .replace(/`([^`]+)`/g,"$1")
  .replace(/^-+\s*/gm,"")
  .replace(/^[*\u2022]\s*/gm,"")
  .replace(/\|/g," ")
  .replace(/\[(.*?)\]\((.*?)\)/g,"$1")
  .replace(/\s{2,}/g," ")
  .replace(/\s*\n\s*/g,". ")
  .replace(/(\.)(\w)/g,"$1 $2")
  .replace(/#+/g,"")
  .trim();

const limitWords=(s,max=200)=>{const words=String(s||"").split(/\s+/);return words.length<=max?s:words.slice(0,max).join(" ")+"…";};
const buildStagesLine=(statuses={})=>{
  const pretty={gateEntry:"Gate Entry",vehicleInspection:"Vehicle",materialInspection:"Material",weightCapture:"Weight",grnPosting:"GRN"};
  const parts=Object.entries(pretty).map(([k,label])=>`${label}: ${statuses?.[k]??"-"}`);
  return `Stage snapshot — ${parts.join("; ")}.`;
};

// speechSynthesis controller
const useTTS=(getLang,getTone)=>{
  const [state,setState]=useState("idle");
  const queueRef=useRef([]); const onEndRef=useRef(null);
  const TONES={neutral:{rate:1,pitch:1,volume:1},friendly:{rate:1.06,pitch:1.08,volume:1},formal:{rate:0.95,pitch:0.9,volume:1}};
  const cfg=()=>{const t=TONES[getTone()]||TONES.neutral;return {...t,lang:getLang()};};
  const cancelAll=()=>{try{window.speechSynthesis.cancel();}catch{} queueRef.current=[]; setState("idle");};
  const chunkForSpeech=(s)=>{const text=String(s||"").replace(/\s+/g," ").trim(); if(!text) return []; const MAX=210; const out=[]; let i=0; while(i<text.length){ let j=Math.min(i+MAX,text.length); const dot=text.lastIndexOf(". ",j); const br=text.lastIndexOf(", ",j); if(dot>i+60) j=dot+1; else if(br>i+60) j=br+1; out.push(text.slice(i,j).trim()); i=j;} return out;};
  const play=(text)=>{ if(!text) return; cancelAll(); const chunks=chunkForSpeech(text); const {lang,rate,pitch,volume}=cfg(); chunks.forEach((c,i)=>{ const u=new SpeechSynthesisUtterance(c); u.lang=lang; u.rate=rate; u.pitch=pitch; u.volume=volume; u.onstart=()=>setState("playing"); u.onend=()=>{ if(i===chunks.length-1){ setState("idle"); onEndRef.current&&onEndRef.current(); } }; queueRef.current.push(u); }); try{queueRef.current.forEach((u)=>window.speechSynthesis.speak(u));}catch{} };
  const pause=()=>{ try{window.speechSynthesis.pause(); setState("paused");}catch{} };
  const resume=()=>{ try{window.speechSynthesis.resume(); setState("playing");}catch{} };
  const stop=()=>cancelAll();
  const onEnd=(cb)=>{ onEndRef.current=cb; };
  return {state,play,pause,resume,stop,onEnd};
};

/* ============================= LABEL helpers (kept from your version) ============================= */
const isLabelToken=(s)=>/^LBL[-_]/i.test(String(s||"").trim());
const fmtDt=(s)=>s?new Date(s).toLocaleString():"-";
const n3=(n)=>Number(n??0).toFixed(3);

const fetchLabelHeader=async(uid)=>{
  const sel="uid,material_code,material_desc,uom,net_qty,num_containers,item_batch_no,exp_date,next_inspection_date,grn_no,line_no,invoice_no,vendor_code,vendor_batch_no,printed_at,printed_by,manufacturer";
  let {data}=await supabase.from("vw_label_prints_latest").select(sel).eq("uid",uid).maybeSingle();
  if(!data){
    const r=await supabase.from("label_prints").select(sel).eq("uid",uid).order("printed_at",{ascending:false}).limit(1).maybeSingle();
    data=r.data||null;
  }
  return data;
};

const fetchCurrentAndQC=async(uid)=>{
  let cur=null,qc=null;
  try{ const v=await supabase.from("vw_mapped_in_full").select("*").eq("uid",uid).limit(1); cur=(v.data||[])[0]||null; }catch{}
  if(!cur){
    const base=await supabase.from("material_location").select("label_uid,location_code,status,qty,containers,placed_at,updated_at").eq("label_uid",uid).eq("status","IN").maybeSingle();
    cur=base.data||null;
  }
  try{ const q=await supabase.from("vw_material_quality_latest").select("label_uid,quality_status,quality_changed_at,quality_reason").eq("label_uid",uid).maybeSingle(); qc=q.data||null; }catch{}
  return {cur,qc};
};

const fetchMoveLogs=async(uid)=>{
  const {data,error}=await supabase
    .from("material_location_events")
    .select("event_at,created_at,event_type,from_location,to_location,qty,container_count,delta_qty,delta_containers,done_by,movement_reason,movement_note")
    .eq("label_uid",uid)
    .order("event_at",{ascending:true});
  return error?[]:(data||[]);
};

const fetchQCLogs=async(uid)=>{
  const {data,error}=await supabase
    .from("material_quality_events")
    .select("event_at,created_at,new_status,reason,changed_by_name")
    .eq("label_uid",uid)
    .order("event_at",{ascending:true});
  return error?[]:(data||[]);
};

const getLabelFacts=async(uid)=>{
  const [header,{cur,qc},moves,qcs]=await Promise.all([fetchLabelHeader(uid),fetchCurrentAndQC(uid),fetchMoveLogs(uid),fetchQCLogs(uid)]);
  return {uid,header,cur,qc,moves,qcs};
};

const buildLabelReportMarkdown=(f)=>{
  const h=f.header||{}; const cur=f.cur||{}; const qc=f.qc||{}; const now=new Date().toLocaleString();
  const matId=`${h.material_code||"-"} ${h.material_desc?("• "+h.material_desc):""}`.trim();
  const summary=[
    `**Label**: ${f.uid}`,
    `**Material**: ${matId||"-"}`,
    `**Current Location**: ${cur.location_code||"-"}  •  **Status**: ${cur.status||"-"}`,
    `**Live Qty**: ${cur.qty!=null?n3(cur.qty):"-"} ${h.uom||""}  •  **Containers**: ${cur.containers??"-"}`,
    `**QC**: ${qc.quality_status||"QUARANTINE"}  •  **QC Updated**: ${fmtDt(qc.quality_changed_at)}`,
    `**Expiry**: ${h.exp_date||"-"}  •  **Next Inspection**: ${h.next_inspection_date||"-"}`
  ].join("\n");

  const moveBullets=(f.moves||[]).map((m)=>{
    const when=fmtDt(m.event_at||m.created_at);
    const leg=(m.from_location||"-")+" → "+(m.to_location||"-");
    const q=m.qty!=null?`qty=${n3(m.qty)}`:((m.delta_qty!=null||m.delta_containers!=null)?`Δqty=${n3(m.delta_qty||0)}, Δctn=${m.delta_containers??0}`:"");
    const c=m.container_count!=null?`ctn=${m.container_count}`:"";
    const why=m.movement_reason?` • reason: ${m.movement_reason}`:"";
    const note=m.movement_note?` • note: ${m.movement_note}`:"";
    return `- ${when} • ${m.event_type} • ${leg} ${[q,c].filter(Boolean).join(" ")} • by ${m.done_by||"-"}${why}${note}`;
  });

  const qcBullets=(f.qcs||[]).map((q)=>{
    const when=fmtDt(q.event_at||q.created_at);
    return `- ${when} • ${q.new_status} • reason: ${q.reason||"-"} • by ${q.changed_by_name||"-"}`;
  });

  const qcTable=[
    "| Time | Status | Reason | By |",
    "|---|---|---|---|",
    ...(f.qcs||[]).map((q)=>`| ${fmtDt(q.event_at||q.created_at)} | ${q.new_status} | ${q.reason||"-"} | ${q.changed_by_name||"-"} |`)
  ].join("\n");

  const moveTable=[
    "| Time | Type | From | To | Qty | ΔQty | Ctn | ΔCtn | By | Reason |",
    "|---|---|---|---|---:|---:|---:|---:|---|---|",
    ...(f.moves||[]).map((m)=>`| ${fmtDt(m.event_at||m.created_at)} | ${m.event_type} | ${m.from_location||"-"} | ${m.to_location||"-"} | ${n3(m.qty??0)} | ${m.delta_qty!=null?n3(m.delta_qty):"-"} | ${m.container_count!=null?m.container_count:"-"} | ${m.delta_containers!=null?m.delta_containers:"-"} | ${m.done_by||"-"} | ${m.movement_reason||"-"} |`)
  ].join("\n");

  return [
    `# Material Movement Report — ${matId||"-"} (${f.uid})`,
    `Generated: ${now}`,
    "",
    "## Executive Summary",
    summary,
    "",
    "## Movement Narrative",
    moveBullets.length?moveBullets.join("\n"):"- No movement records.",
    "",
    "## QC History",
    qcBullets.length?qcBullets.join("\n"):"- No QC records.",
    "",
    "## QC Events (Table)",
    qcTable,
    "",
    "## Movement Events (Table)",
    moveTable,
    "",
    "## Label & GRN",
    `- GRN: ${h.grn_no||"-"} • Line: ${h.line_no||"-"} • Invoice: ${h.invoice_no||"-"}`,
    `- Vendor: ${h.vendor_code||"-"} • Vendor Batch: ${h.vendor_batch_no||"-"} • Manufacturer: ${h.manufacturer||"-"}`,
    `- Printed At: ${fmtDt(h.printed_at)} • Printed By: ${h.printed_by||"-"}`
  ].join("\n");
};

/* ============================= component ============================= */
const AiReport=({userId})=>{
  const TABS=[{k:"auto",label:"Auto Report",icon:FileText},{k:"chat",label:"AI Assistant",icon:Sparkles},{k:"flow",label:"Flow & Snapshot",icon:GitBranch}];
  const [tab,setTab]=useState("auto");

  const [reportPo,setReportPo]=useState("");
  const [reportBusy,setReportBusy]=useState(false);

  const [history,setHistory]=useState([]);
  const [lastAnswerRaw,setLastAnswerRaw]=useState("");
  const [lastVisibleText,setLastVisibleText]=useState("");

  const [flowSummary,setFlowSummary]=useState(null); // <- keep only summary
  const [labelFacts,setLabelFacts]=useState(null);   // label-mode cache

  const voice=useVoiceShim();
  const [voiceLang,setVoiceLang]=useState("en-IN");
  const [tone,setTone]=useState("neutral");
  const [listening,setListening]=useState(false);
  const [heard,setHeard]=useState("");

  const [autoSpeak,setAutoSpeak]=useState(true);
  const [readMode,setReadMode]=useState("summary");
  const [currentPo,setCurrentPo]=useState("");

  const tts=useTTS(()=>voiceLang,()=>tone);

  const startTalk=()=>{ setHeard(""); setListening(true); try{voice?.setConfig?.({lang:voiceLang}); voice?.start?.();}catch{} };
  const stopTalkAndRun=()=>{
    try{
      voice?.stop?.(async(finalText)=>{
        const said=String(finalText||"").trim();
        setHeard(said);
        if(!said){ setListening(false); return; }
        const token=said.replace(/^auto\s*report\s*(for)?\s*/i,"").trim();
        setReportPo(token);
        await generateAutoReport(token);
        setListening(false);
      });
    }catch{ setListening(false); }
  };

  const composeSpokenText=(visible)=>{
    const greet=`Hello! Here is your auto report for ${currentPo||"the requested order"}.`;
    const cleanBody=mdToPlain(visible);
    if(readMode==="full"){
      const closing="That concludes the report. Would you like me to email the PDF or drill into any step?";
      return `${greet} ${cleanBody} ${closing}`;
    }
    const firstTwo=cleanBody.split(/(?<=[.!?])\s+/).slice(0,2).join(" ");
    const brief=limitWords(firstTwo,110);
    const stages=buildStagesLine(flowSummary?.statuses||{});
    const closing="For the full narrative, switch to Full and press Play.";
    return `${greet} ${brief} ${stages} ${closing}`;
  };

  const speakNow=(visibleText)=>{ const speech=composeSpokenText(visibleText); tts.play(speech); };

  // AI call (kept)
  const sendToAI=async(text)=>{
    let bearer=import.meta.env.VITE_SUPABASE_ANON_KEY;
    try{ const {data:{session}}=await supabase.auth.getSession(); if(session?.access_token) bearer=session.access_token; }catch{}
    const body={query:text,mode:"gen",topK:0,minSim:0.6,userId};
    const r=await fetch(AI_ENDPOINT,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${bearer}`},body:JSON.stringify(body)});
    const j=await r.json();
    if(!r.ok) throw new Error(j.error||"AI call failed");

    const visible=stripMachinePayloads(j.answer||"");
    setLastAnswerRaw(j.answer||"");
    setLastVisibleText(visible);
    const chatHtml=mdToHtml(visible);
    setHistory([{role:"assistant",contentHtml:chatHtml}]);

    if(autoSpeak){ speakNow(visible); }
    return j;
  };

  /* ====== LABEL report path ====== */
  const generateLabelReport=async(labelOrMat)=>{
    const token=String(labelOrMat||reportPo||"").trim();
    const uid=token;
    if(!isLabelToken(uid)){ alert("Enter a Label UID like LBL-GRN-…"); return; }

    setReportBusy(true);
    try{
      const facts=await getLabelFacts(uid);
      setLabelFacts(facts);

      const md=buildLabelReportMarkdown(facts);
      const html=mdToHtml(md);
      setHistory([{role:"assistant",contentHtml:html}]);
      setLastAnswerRaw(md);
      setLastVisibleText(md);

      // Try to also show the PO flow if we can hop UID -> GRN -> PO
      const grn=facts?.header?.grn_no;
      if(grn){
        const r=await supabase.from("grn_postings").select("po_no").eq("grn_no",grn).maybeSingle();
        if(r.data?.po_no) setCurrentPo(r.data.po_no);
      } else {
        setCurrentPo("");
      }

      if(autoSpeak){ speakNow(md); }
    }catch(e){
      console.error(e);
      alert(e?.message||"Label report failed");
    }finally{
      setReportBusy(false);
    }
  };

  /* ====== Auto Report (PO/GRN/GE) ====== */
  const generateAutoReport=async(tokenOverride)=>{
    const raw=String((tokenOverride??reportPo)||"").trim();
    if(!raw){ alert("Enter PO/GRN/Gate Pass/Label UID"); return; }

    // Label path
    if(isLabelToken(raw)){ await generateLabelReport(raw); setTab("auto"); return; }

    setReportBusy(true);
    try{
      setLabelFacts(null); // reset label mode
      const poNo=await resolveAnyToPO(raw);
      setCurrentPo(poNo);

      const facts=await getFlowFactsForPO(poNo);
      setFlowSummary(facts.summary||null);
      setTab("auto");

      const prompt=[
        `Write a GMP-style Auto Report for Purchase Order ${poNo}.`,
        `Tone: sound like a human operations lead—clear and professional. Avoid robotic phrasing.`,
        `Sections: 1) Executive Summary (120–180 words) 2) Movement Narrative (bullets) 3) Conclusion & Next Steps.`,
        `Include invoice and GRN(s). When available, mention label counts and storage locations with current material status (e.g., Quarantine/Released).`,
        `Do NOT include any "Stage Status" section.`,
        `No JSON or machine payload in the visible answer.`,
        `Data: ${JSON.stringify({summary:facts.summary,grnRows:(facts.grnRows||[]).slice(0,200),labelRows:(facts.labelRows||[]).slice(0,200),palletRows:(facts.palletRows||[]).slice(0,200)})}`
      ].join("\n");

      await sendToAI(prompt);
    }catch(e){
      console.error(e);
      alert(e?.message||"Auto report failed");
    }finally{
      setReportBusy(false);
    }
  };

  /* ====== PDF Export ====== */
  const exportReportAsPDF=async()=>{
    const a=[...history].reverse().find((h)=>h.role==="assistant");
    const html=a?.contentHtml||"";
    if(!html){ alert("No report to export yet."); return; }

    try{
      const [{jsPDF},autoTpl]=await Promise.all([
        import("jspdf"),
        import("jspdf-autotable").catch(()=>({default:null}))
      ]);
      const autoTable=autoTpl?.default||null;

      const doc=new jsPDF({orientation:"p",unit:"pt",format:"a4"});
      const pageW=doc.internal.pageSize.getWidth();
      const pageH=doc.internal.pageSize.getHeight();
      const M=48;
      let y=0;

      // Brand banner
      doc.setFillColor(20,90,200);
      doc.rect(0,0,pageW,64,"F");
      try{ doc.addImage(logo,"PNG",M,18,28,28); }catch{}
      doc.setFont("helvetica","bold"); doc.setFontSize(16); doc.setTextColor(255);
      doc.text("DigitizerX • Auto Report",M+36,38);

      // Meta row
      y=64+10;
      doc.setTextColor(40); doc.setFont("helvetica","normal"); doc.setFontSize(10);
      const metaLeft=`PO/Ref: ${flowSummary?.poNo||currentPo||reportPo||"-"}`;
      const metaRight=`Generated: ${new Date().toLocaleString()}`;
      doc.text(metaLeft,M,y);
      doc.text(metaRight,pageW-M-doc.getTextWidth(metaRight),y);
      y+=12;

      // Render the assistant HTML as simple text paragraphs
      const section=(title)=>{ y+=14; doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.setTextColor(20,90,200); doc.text(title,M,y); y+=6; doc.setDrawColor(230); doc.setLineWidth(1); doc.line(M,y,pageW-M,y); y+=10; doc.setTextColor(30); doc.setFont("helvetica","normal"); doc.setFontSize(10); };
      const writePara=(text,maxW=pageW-2*M)=>{ const clean=text.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim(); const lines=doc.splitTextToSize(clean,maxW); doc.text(lines,M,y); y+=lines.length*13+2; };

      section("Narrative");
      writePara(html);

      // Footer
      const pageCount=doc.internal.getNumberOfPages();
      for(let i=1;i<=pageCount;i++){
        doc.setPage(i);
        doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(120);
        const footer=`DigitizerX • Confidential — Page ${i} of ${pageCount}`;
        doc.text(footer,M,pageH-18);
      }

      const baseName=labelFacts?.uid||flowSummary?.poNo||currentPo||reportPo||"Report";
      const filename=`DigitizerX_AutoReport_${baseName}.pdf`;
      doc.save(filename);
    }catch(err){
      console.error(err);
      // Fallback
      const blob=new Blob([a?.contentHtml||""],{type:"text/html"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url; link.download="DigitizerX_AutoReport.html"; link.click();
      URL.revokeObjectURL(url);
    }
  };

  const Bubble=({role,childrenHtml})=>{
    const isUser=role==="user";
    return (
      <div className={`flex ${isUser?"justify-end":"justify-start"} my-2`}>
        <div
          className={`max-w-[92%] md:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-6 shadow ${isUser?"bg-blue-600 text-white":"bg-white text-slate-900 border"}`}
          dangerouslySetInnerHTML={{__html:childrenHtml}}
        />
      </div>
    );
  };

  return (
    <div className="container mx-auto">
      {/* Header */}
      <div className="rounded-xl mb-6 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-5 md:px-7 py-5 flex flex-wrap items-center gap-3">
          <div className="text-xl md:text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Bot size={18} className="opacity-90" />
            <span>AI Modules</span>
          </div>

          {/* Brand center */}
          <div className="flex-1 flex justify-center">
            <div className="flex items-center gap-4">
              <img src={logo} alt="Logo" className="w-16 h-auto" />
              <h1 className="text-2xl font-bold text-white">DigitizerX</h1>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {TABS.map((t)=>(
              <button
                key={t.k}
                onClick={()=>setTab(t.k)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border ${tab===t.k?"bg-white text-blue-800 border-white":"bg-white/10 text-white border-white/30 hover:bg-white/20"}`}
              >
                <t.icon className="inline -mt-0.5 mr-1" size={14} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab==="auto"&&(
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-semibold text-blue-800 flex items-center gap-2">
              <FileText size={16} /> Auto Report (PO / GRN / Gate Pass / Label)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <FileText size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600" />
                <input
                  value={reportPo}
                  onChange={(e)=>setReportPo(e.target.value)}
                  placeholder="Enter PO / GRN / GE / LBL (e.g., MFI/25/PO/00079 or LBL-GRN-20250903-7538-001-002)"
                  className="text-sm border rounded-lg pl-8 pr-3 py-2 w-96 bg-white text-slate-900"
                />
              </div>

              <Button type="button" onClick={()=>generateAutoReport()} disabled={reportBusy||!reportPo} className="px-3">
                {reportBusy?(
                  <>
                    <Loader2 size={14} className="animate-spin mr-1" />
                    Generating…
                  </>
                ):(
                  <>
                    <Sparkles size={14} className="mr-1" />
                    Auto Report
                  </>
                )}
              </Button>

              {/* Hold-to-talk */}
              <button
                type="button"
                onMouseDown={startTalk}
                onMouseUp={stopTalkAndRun}
                onTouchStart={startTalk}
                onTouchEnd={stopTalkAndRun}
                className={`h-9 px-3 rounded-md border flex items-center gap-1 ${listening?"bg-blue-600 text-white border-blue-700":"bg-white text-blue-700 border-blue-200"}`}
                title="Hold to talk: say 'Auto report for PO/GRN/GE/LBL …'"
              >
                {listening?<Square size={14} />:<Mic size={14} />}
                <span className="text-[12px]">{listening?"Release to run":"Hold to talk"}</span>
              </button>

              <Button type="button" onClick={exportReportAsPDF} variant="outline" className="px-3">
                <Download size={14} className="mr-1" />
                Export PDF
              </Button>

              <div className="ml-auto flex items-center gap-3">
                <label className="text-xs inline-flex items-center gap-2">
                  <input type="checkbox" checked={autoSpeak} onChange={(e)=>setAutoSpeak(e.target.checked)} />
                  Auto-speak
                </label>

                <div className="text-xs text-slate-600 flex items-center gap-2">
                  Read:
                  <select value={readMode} onChange={(e)=>setReadMode(e.target.value)} className="text-xs border rounded px-1.5 py-1 bg-white">
                    <option value="summary">Summary</option>
                    <option value="full">Full report</option>
                  </select>
                </div>

                <div className="text-xs text-slate-600 flex items-center gap-2">
                  <Languages size={12} className="text-blue-700" />
                  <select value={voiceLang} onChange={(e)=>setVoiceLang(e.target.value)} className="text-xs border rounded px-1.5 py-1 bg-white">
                    {LOCALES.map((o)=>(<option key={o.v} value={o.v}>{o.label}</option>))}
                  </select>
                </div>

                {/* TTS transport */}
                <div className="flex items-center gap-1">
                  <button type="button" className="h-8 w-8 grid place-items-center rounded border bg-white text-blue-700" title="Play / Resume" onClick={()=>speakNow(lastVisibleText||"There is no report yet.")}>
                    <Play size={14} />
                  </button>
                  <button type="button" className="h-8 w-8 grid place-items-center rounded border bg-white text-blue-700" title="Pause" onClick={tts.pause} disabled={tts.state!=="playing"}>
                    <Pause size={14} />
                  </button>
                  <button type="button" className="h-8 w-8 grid place-items-center rounded border bg-white text-blue-700" title="Stop" onClick={tts.stop} disabled={tts.state==="idle"}>
                    <Square size={14} />
                  </button>
                </div>
              </div>
            </div>

            {heard&&(
              <div className="text-[12px] text-slate-600 -mt-2">
                Heard: <span className="font-medium">{heard}</span>
              </div>
            )}

            {/* Assistant preview */}
            <Card className="p-3 md:p-4">
              {(()=> {
                const lastAssistant=[...history].reverse().find((m)=>m.role==="assistant");
                if(!lastAssistant){
                  return (
                    <div className="text-sm text-slate-600 flex items-center gap-2">
                      <Info size={14} />
                      Enter a token or hold the mic and say <b>“Auto report for …”</b>.
                    </div>
                  );
                }
                return <Bubble role="assistant" childrenHtml={lastAssistant.contentHtml} />;
              })()}
            </Card>

            {/* Flow (InboundPOFlow) */}
            <Card className="p-3 md:p-4">
              <div className="flex items-center gap-2 mb-2">
                <GitBranch size={16} className="text-blue-700" />
                <div className="font-semibold">Process Flow</div>
                <span className="text-[12px] text-slate-500">Visualizes material movement stages</span>
              </div>

              <InboundPOFlow
                poNo={currentPo || reportPo /* if user typed a PO outright */}
                stageHeightVh={56}
                autoFetch
                showExport
              />
            </Card>
          </CardContent>
        </Card>
      )}

      {tab==="chat"&&(
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-semibold text-blue-800 flex items-center gap-2">
              <Sparkles size={16} /> AI Assistant
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AIChatPanel title="DigitizerX • AI Assistant" userId={userId} />
          </CardContent>
        </Card>
      )}

      {tab==="flow"&&(
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-semibold text-blue-800 flex items-center gap-2">
              <GitBranch size={16} /> Flow & Snapshot
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-slate-600">
              This tab reflects the current PO value. Re-run an Auto Report to refresh.
            </div>
            <InboundPOFlow
              poNo={currentPo || reportPo}
              stageHeightVh={64}
              autoFetch
              showExport
            />
          </CardContent>
        </Card>
      )}

      <div className="mt-3 text-[11px] text-slate-500">
        Compliant assistant (GxP, 21 CFR Part 11, GAMP 5). Logged in <code>ai_audit_logs</code>.
      </div>
    </div>
  );
};

export default AiReport;
