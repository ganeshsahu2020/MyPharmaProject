// src/components/AIChatPanel.jsx
import React,{useEffect,useMemo,useRef,useState} from "react";
import {
  Sparkles,Send,Loader2,FileText,Database,Cpu,ShieldCheck,Clock,
  Wrench,Mic,Volume2,Pause,Play,Square,RotateCw,SlidersHorizontal,
  Upload,Download,Video,Info,Languages,ListFilter,User,AudioLines,
  Headphones,GitBranch, ClipboardList
} from "lucide-react";
import { Link } from "react-router-dom";
import Button from "./ui/Button";
import { Card } from "./ui/card";
import * as QV from "../hooks/useQuickVoice";
import { supabase } from "../utils/supabaseClient";
import WebAvatar from "./WebAvatar";
import InboundPOFlow from "./InboundPOFlow";

/* ---------- Voice hook shim (ALWAYS call a hook exactly once) ---------- */
function useQuickVoiceFallback(){
  return React.useMemo(()=>({
    state:{isRecording:false,level:0,transcript:"",error:""},
    micSupported:false,
    setConfig:()=>{},
    start:()=>{},
    stop:(cb)=>cb?.(""),
    speak:()=>{}
  }),[]);
}
function useVoiceShim(){
  const impl = QV.useQuickVoice||QV.default||useQuickVoiceFallback;
  return impl();
}

const AI_BASE = import.meta.env.VITE_SUPABASE_URL||"";
const AI_ENDPOINT = AI_BASE+(import.meta.env.VITE_AI_ENDPOINT||"/functions/v1/ai-ask");

/* ---------- STT Locales ---------- */
const LOCALES = [
  {v:"en-US",label:"English (US)"},
  {v:"en-IN",label:"English (India)"},
  {v:"en-GB",label:"English (UK)"},
  {v:"hi-IN",label:"Hindi (India)"},
  {v:"mr-IN",label:"Marathi (India)"},
  {v:"ta-IN",label:"Tamil (India)"},
  {v:"te-IN",label:"Telugu (India)"},
  {v:"bn-IN",label:"Bengali (India)"},
  {v:"gu-IN",label:"Gujarati (India)"},
  {v:"pa-IN",label:"Punjabi (India)"},
  {v:"kn-IN",label:"Kannada (India)"},
  {v:"ml-IN",label:"Malayalam (India)"}
];

/* ---------- TTS tone presets ---------- */
const TONES = {
  neutral:{rate:1.0,pitch:1.0,volume:1.0},
  friendly:{rate:1.06,pitch:1.08,volume:1.0},
  empathetic:{rate:0.95,pitch:0.95,volume:1.0},
  formal:{rate:0.95,pitch:0.9,volume:1.0},
  energetic:{rate:1.15,pitch:1.15,volume:1.0},
  calm:{rate:0.9,pitch:0.95,volume:1.0}
};

/* ---------- Voice gender helpers ---------- */
const FEMALE_HINTS=["female","woman","samantha","victoria","karen","tessa","zira","natasha","sona","veena","susan","sara","kathy","moira","anya"];
const MALE_HINTS=["male","man","daniel","alex","fred","mark","david","ravi","george","arthur","albert","oliver","thomas"];
const pickVoiceByGender=(voices,lang,gender)=>{
  const all=voices||[];
  const same=all.filter((v)=>v.lang===lang);
  const base=lang.split("-")[0];
  const baseList=all.filter((v)=>v.lang?.startsWith(base));
  const pick=(arr)=>{
    if(gender==="female") return arr.find((v)=>FEMALE_HINTS.some((h)=>v.name.toLowerCase().includes(h)))||null;
    if(gender==="male") return arr.find((v)=>MALE_HINTS.some((h)=>v.name.toLowerCase().includes(h)))||null;
    return arr[0]||null;
  };
  return pick(same)||pick(baseList)||pick(all)||null;
};

/* ---------- Toast shim ---------- */
const useToastSafe=()=>{
  const ref=useRef(null);
  useEffect(()=>{
    let mounted=true;
    import("react-hot-toast").then((m)=>{if(mounted){ref.current=m.toast;}}).catch(()=>{});
    return()=>{mounted=false;};
  },[]);
  const promise=(p,msgs)=>(ref.current?.promise?ref.current.promise(p,msgs):p);
  const success=(m)=>ref.current?.success?.(m);
  const error=(m)=>ref.current?.error?.(m);
  return{promise,success,error};
};

/* ---------- Minimal Markdown ---------- */
const escapeHtml=(s)=>s.replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const mdToHtml=(raw)=>{
  let s=escapeHtml(raw||"");
  s=s.replace(/```(\w+)?\n([\s\S]*?)```/g,(m,lang,code)=>`<pre class="dx-pre"><code class="dx-code" data-lang="${lang||""}">${code.replace(/\n/g,"<br/>")}</code></pre>`);
  s=s.replace(/`([^`]+)`/g,'<code class="dx-icode">$1</code>');
  s=s.replace(/^######\s?(.*)$/gm,"<h6>$1</h6>")
    .replace(/^#####\s?(.*)$/gm,"<h5>$1</h5>")
    .replace(/^####\s?(.*)$/gm,"<h4>$1</h4>")
    .replace(/^###\s?(.*)$/gm,"<h3>$1</h3>")
    .replace(/^##\s?(.*)$/gm,"<h2>$1</h2>")
    .replace(/^#\s?(.*)$/gm,"<h1>$1</h1>");
  s=s.replace(/\*\*([^*]+)\*\*/g,"<b>$1</b>").replace(/\*([^*]+)\*/g,"<i>$1</i>");
  s=s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noreferrer" className="dx-link">$1</a>');
  s=s.replace(/^(?:-|\*) (.*(?:\n(?:-|\*) .*)*)/gm,(m,items)=>{
    const lis=items.split(/\n/).map((l)=>l.replace(/^(?:-|\*)\s?/,"")).map((t)=>`<li>${t}</li>`).join("");
    return `<ul className="dx-list">${lis}</ul>`;
  });
  s=s.replace(/\n{2,}/g,"</p><p>").replace(/^(?!<h\d|<ul|<pre|<p|<\/p>)(.+)$/gm,"<p>$1</p>").replace(/\n/g,"<br/>");
  return s;
};

/* ---------- UI bits ---------- */
const BrandBadge=({children})=>(
  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
    {children}
  </span>
);
const Hint=({icon:Icon,children})=>(
  <div className="flex items-start gap-2 text-[12px] text-slate-600">
    <Icon size={14} className="mt-[2px] text-blue-600"/>
    <div className="leading-5">{children}</div>
  </div>
);
const Field=({icon:Icon,children,title})=>(
  <div title={title} className="inline-flex items-center h-9 rounded-lg border bg-white text-slate-900 border-white/60 px-2 shadow-sm">
    {Icon?<Icon size={14} className="text-blue-600 mr-1"/>:null}
    {children}
  </div>
);
const ModePill=({mode,setMode})=>(
  <div className="inline-flex rounded-xl border bg-white overflow-hidden shadow-sm">
    {[
      {k:"rag",label:"RAG",icon:Database},
      {k:"gen",label:"GEN",icon:Sparkles},
      {k:"ops",label:"OPS",icon:Cpu}
    ].map((m)=>{
      const active=mode===m.k;
      return(
        <button key={m.k} onClick={()=>setMode(m.k)} aria-pressed={active} data-active={active?"true":"false"}
          className={`px-3 py-1.5 text-xs flex items-center gap-1 transition ${active?"bg-blue-700 text-white ring-2 ring-blue-400":"text-slate-800 hover:bg-slate-50 active:scale-[0.98]"}`} title={m.label}>
          <m.icon size={14}/>
          <span className="font-semibold">{m.label}</span>
        </button>
      );
    })}
  </div>
);

/* ---------- Cost badge ---------- */
const DEFAULT_RATES={
  chat_in:Number(import.meta.env.VITE_PRICE_CHAT_IN_PER_1K??0.00015),
  chat_out:Number(import.meta.env.VITE_PRICE_CHAT_OUT_PER_1K??0.0006),
  embed:Number(import.meta.env.VITE_PRICE_EMB_PER_1K??0.00002)
};
const CostBadge=({cost,usage})=>{
  if(!usage) return null;
  const rates=(cost?.pricing_per_1k&&{
    chat_in:Number(cost.pricing_per_1k.chat_in??DEFAULT_RATES.chat_in),
    chat_out:Number(cost.pricing_per_1k.chat_out??DEFAULT_RATES.chat_out),
    embed:Number(cost.pricing_per_1k.embed??DEFAULT_RATES.embed)
  })||DEFAULT_RATES;
  const prompt=usage.prompt_tokens||0;
  const completion=usage.completion_tokens||0;
  const emb=usage.embedding_tokens||0;
  const estIn=(prompt/1000)*rates.chat_in;
  const estOut=(completion/1000)*rates.chat_out;
  const estEmb=(emb/1000)*rates.embed;
  const total=typeof cost?.total==="number"?cost.total:(estIn+estOut+estEmb);
  const estimated=typeof cost?.total!=="number";
  const fmt=(n)=>`$${Number(n||0).toFixed(6)}`;
  return(
    <div className="pointer-events-none fixed md:absolute bottom-3 right-3 bg-slate-900/85 text-white text-[11px] px-3 py-2 rounded-full shadow-md backdrop-blur-sm">
      <span className="font-semibold">{estimated?"≈ ":""}{fmt(total)}</span>
      <span className="mx-2 opacity-70">•</span>
      <span>{prompt} in / {completion} out</span>
      {emb?(<><span className="mx-2 opacity-70">•</span><span>{emb} emb</span></>):null}
      <span className="mx-2 opacity-70">•</span>
      <span>{fmt(rates.chat_in)} in/1k</span>
      <span className="mx-1">·</span>
      <span>{fmt(rates.chat_out)} out/1k</span>
      {typeof rates.embed==="number"?(<><span className="mx-1">·</span><span>{fmt(rates.embed)} emb/1k</span></>):null}
    </div>
  );
};

const Bubble=({role,childrenHtml})=>{
  const isUser=role==="user";
  return(
    <div className={`flex ${isUser?"justify-end":"justify-start"} my-2`}>
      <div className={`max-w-[92%] md:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-6 shadow ${isUser?"bg-blue-600 text-white":"bg-white text-slate-900 border"}`} dangerouslySetInnerHTML={{__html:childrenHtml}}/>
    </div>
  );
};
const SourcePills=({sources})=>{
  if(!sources?.length) return null;
  return(
    <div className="mt-3 flex flex-wrap gap-2">
      {sources.map((s)=>(
        <span key={s.id} className="text-[11px] px-2 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
          <FileText size={12} className="inline mr-1 -mt-[2px] text-blue-700"/>
          {s.source}{typeof s.similarity==="number"&&(<span className="opacity-70"> · sim {s.similarity.toFixed?.(2)}</span>)}
        </span>
      ))}
    </div>
  );
};
const PreviewTable=({sources})=>{
  if(!sources?.length) return null;
  const status=(sim)=>sim>=0.75?{t:"High",c:"bg-emerald-50 text-emerald-800 border-emerald-200"}:sim>=0.5?{t:"Medium",c:"bg-amber-50 text-amber-800 border-amber-200"}:{t:"Low",c:"bg-rose-50 text-rose-800 border-rose-200"};
  return(
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-slate-50"><tr><th className="text-left px-3 py-2 border-b">Source</th><th className="text-left px-3 py-2 border-b">Similarity</th><th className="text-left px-3 py-2 border-b">Status</th></tr></thead>
        <tbody>
          {sources.map((s)=>(
            <tr key={s.id} className="odd:bg-white even:bg-slate-50/30">
              <td className="px-3 py-2 border-b">{s.source}</td>
              <td className="px-3 py-2 border-b">{typeof s.similarity==="number"?s.similarity.toFixed(3):"—"}</td>
              <td className="px-3 py-2 border-b"><span className={`text-[11px] px-2 py-1 rounded-full border ${status(s.similarity||0).c}`}>{status(s.similarity||0).t}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
const SkeletonLine=({w="100%"})=>(<div className="h-3 rounded bg-slate-200/70 animate-pulse my-2" style={{width:w}}/>);
const SkeletonAnswer=()=>(<div className="bg-white border rounded-2xl p-4 my-2"><SkeletonLine w="85%"/><SkeletonLine w="95%"/><SkeletonLine w="90%"/><SkeletonLine w="60%"/></div>);
const QuickChips=({onPick,mode})=>{
  const chips=[
    {t:"What is the release authority in SOP-0007? Cite page.",m:"rag"},
    {t:"Draft a GMP-friendly pallet label for Product AC-12, Batch B-009, MFG 2025-08-10, EXP 2027-08-10, Qty 12 kg.",m:"gen"},
    {t:"yesterday breakdowns",m:"ops"},
    {t:"next PM schedule",m:"ops"},
    {t:"Where do I open Label Master?",m:"ops"}
  ];
  return(<div className="flex flex-wrap gap-2">{chips.filter((c)=>c.m===mode).map((c,i)=>(<button key={i} onClick={()=>onPick(c.t)} className="text-[11px] px-2 py-1 rounded-full border bg-white hover:bg-blue-50 text-blue-800 border-blue-200">{c.t}</button>))}</div>);
};

/* ---------- Flow helpers (left intact for backend-parsed answers) ---------- */
const DEMO_FLOW={
  logs:[
    {fromLocation:"Vendor",toLocation:"Gate",materialId:"API-004",status:"created"},
    {fromLocation:"Gate",toLocation:"Weighing",materialId:"API-004",status:"in transit"},
    {fromLocation:"Weighing",toLocation:"QA Hold",materialId:"API-004",status:"review"},
    {fromLocation:"QA Hold",toLocation:"Stores",materialId:"API-004",status:"approved"},
    {fromLocation:"Stores",toLocation:"Production",materialId:"API-004",status:"posted"}
  ],
  summary:{poNo:"PO-2025-0012",invoiceNo:"INV-7742",statuses:{Gate:"done",QA:"approved",GRN:"posted"}},
  details:[
    {gate_pass_no:"GP-1109",lr_no:"LR-55231",vehicle_no:"MH12AB1234",invoice_no:"INV-7742",note:"No damages"}
  ]
};
const take=(v)=>v??null;
const toCamel=(k)=>String(k||"").replace(/[_-](\w)/g,(_,c)=>c.toUpperCase());
const normalizeLog=(e)=>{
  if(!e) return null;
  const obj={...e};
  const read=(...keys)=>keys.map((x)=>obj[x]).find((x)=>x!==undefined&&x!==null);
  const from=read("fromLocation","from","from_location","source","src");
  const to=read("toLocation","to","to_location","dest","destination");
  const mid=read("materialId","material_id","item","item_code","material","mat");
  const status=read("status","state","stage","result");
  if(!from||!to) return null;
  return {fromLocation:String(from),toLocation:String(to),materialId:take(mid),status:take(status)};
};
const extractJsonBlocks=(text)=>{
  if(!text) return [];
  const blocks=[];
  const re=/```(json|flow)?\n([\s\S]*?)```/gi;
  let m; while((m=re.exec(text))){blocks.push(m[2]);}
  return blocks;
};
const tryParseFlowFromAnswer=(answer)=>{
  try{
    const blocks=extractJsonBlocks(answer);
    for(const b of blocks){
      try{
        const j=JSON.parse(b);
        const logs=j?.flow?.logs||j?.flowLogs||j?.logs||j?.edges||Array.isArray(j)?j:null;
        const summary=j?.flow?.summary||j?.summary||null;
        const details=j?.flow?.details||j?.details||null;
        if(logs){
          const norm=(logs||[]).map(normalizeLog).filter(Boolean);
          if(norm.length){return {logs:norm,summary,details};}
        }
      }catch{/* continue */}
    }
    return null;
  }catch{return null;}
};

/* ---------- Greetings ---------- */
const DEFAULT_GREETINGS={
  "en-US":{pre:"Hello.",post:"Anything else?"},
  "en-IN":{pre:"Hello.",post:"Anything else?"},
  "en-GB":{pre:"Hello.",post:"Anything else?"},
  "hi-IN":{pre:"नमस्ते।",post:"क्या मैं और मदद करूँ?"},
  "mr-IN":{pre:"नमस्कार.",post:"आणखी काही मदत हवी आहे का?"},
  "ta-IN":{pre:"வணக்கம்.",post:"வேறு உதவி வேண்டுமா?"},
  "te-IN":{pre:"నమస్తే.",post:"ఇంకేమైనా సహాయం కావాలా?"},
  "bn-IN":{pre:"নমস্কার।",post:"আর কিছু সাহায্য করবো?"},
  "gu-IN":{pre:"નમસ્તે.",post:"બીજું કંઈ મદદ કરूँ?"},
  "pa-IN":{pre:"ਸਤ ਸ੍ਰੀ ਅਕਾਲ.",post:"ਹੋਰ ਕੁਝ ਮਦਦ ਕਰਾਂ?"},
  "kn-IN":{pre:"ನಮಸ್ಕಾರ.",post:"ಇನ್ನೇನಾದರೂ ಸಹಾಯ ಬೇಕೆಯಾ?"},
  "ml-IN":{pre:"നമസ്കാരം.",post:"മറ്റ് സഹായം വേണോ?"}
};
const PRESETS={Strict:{topK:8,minSim:0.6},Balanced:{topK:12,minSim:0.35},Exploratory:{topK:20,minSim:0.25}};

const AIChatPanel=({title="DigitizerX • AI Assistant",userId})=>{
  const toast=useToastSafe();

  // voice hook (unconditional, safe)
  const voice=useVoiceShim();
  const voiceState=voice?.state||{isRecording:false,level:0,transcript:"",error:""};
  const micSupported=!!(voice?.micSupported);

  // avatar ref + toggles
  const avatarRef=useRef(null);
  const [showAvatar,setShowAvatar]=useState(false);

  // flow panel state (legacy flow-vars kept; new PO field added)
  const [showFlow,setShowFlow]=useState(false);
  const [flowLogs,setFlowLogs]=useState([]);
  const [flowSummary,setFlowSummary]=useState(null);
  const [flowDetails,setFlowDetails]=useState([]);
  const [flowLabelEdges,setFlowLabelEdges]=useState(false);
  const [flowPaste,setFlowPaste]=useState("");
  const [flowPo, setFlowPo] = useState("");

  /* ===== persisted prefs ===== */
  const [mode,setMode]=useState(()=>localStorage.getItem("dx.ai.mode")||"rag"); useEffect(()=>{localStorage.setItem("dx.ai.mode",mode);},[mode]);
  const [equipment,setEquipment]=useState(()=>localStorage.getItem("dx.ai.equip")||""); useEffect(()=>{localStorage.setItem("dx.ai.equip",equipment);},[equipment]);
  const [holdToTalk,setHoldToTalk]=useState(()=>localStorage.getItem("dx.ai.hold")!=="false"); useEffect(()=>{localStorage.setItem("dx.ai.hold",String(holdToTalk));},[holdToTalk]);
  const [voiceLang,setVoiceLang]=useState(()=>localStorage.getItem("dx.ai.lang")||"en-IN"); useEffect(()=>{localStorage.setItem("dx.ai.lang",voiceLang);},[voiceLang]);
  const [tone,setTone]=useState(()=>localStorage.getItem("dx.ai.tone")||"neutral"); useEffect(()=>{localStorage.setItem("dx.ai.tone",tone);},[tone]);
  const [autoSpeak,setAutoSpeak]=useState(()=>localStorage.getItem("dx.ai.speak")!=="false"); useEffect(()=>{localStorage.setItem("dx.ai.speak",String(autoSpeak));},[autoSpeak]);
  const [voiceName,setVoiceName]=useState(()=>localStorage.getItem("dx.ai.voiceName")||""); useEffect(()=>{localStorage.setItem("dx.ai.voiceName",voiceName);},[voiceName]);
  const [voiceGender,setVoiceGender]=useState(()=>localStorage.getItem("dx.ai.voiceGender")||"auto"); useEffect(()=>{localStorage.setItem("dx.ai.voiceGender",voiceGender);},[voiceGender]);
  const [greetOnSpeak,setGreetOnSpeak]=useState(()=>localStorage.getItem("dx.ai.greet")!=="false"); useEffect(()=>{localStorage.setItem("dx.ai.greet",String(greetOnSpeak));},[greetOnSpeak]);

  // greetings
  const [greetCustom,setGreetCustom]=useState(()=>{try{return JSON.parse(localStorage.getItem("dx.ai.greet.custom")||"{}");}catch{return{};}});
  useEffect(()=>{localStorage.setItem("dx.ai.greet.custom",JSON.stringify(greetCustom));},[greetCustom]);
  const [showGreetEditor,setShowGreetEditor]=useState(false);

  /* voices list */
  const [voices,setVoices]=useState([]);
  useEffect(()=>{
    const load=()=>{try{setVoices(window.speechSynthesis?.getVoices?.()||[]);}catch{}};
    load();
    try{
      window.speechSynthesis?.addEventListener?.("voiceschanged",load);
      return()=>window.speechSynthesis?.removeEventListener?.("voiceschanged",load);
    }catch{}
  },[]);

  /* chat state */
  const [q,setQ]=useState("");
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const [history,setHistory]=useState([]);
  const [lastCost,setLastCost]=useState(null);
  const [lastUsage,setLastUsage]=useState(null);
  const [lastAnswer,setLastAnswer]=useState("");
  const [lastSpeak,setLastSpeak]=useState({voiceName:"",tone:"neutral",lang:"en-IN"});

  /* advanced knobs (persisted) */
  const [topK,setTopK]=useState(()=>Number(localStorage.getItem("dx.ai.topK")||12)); useEffect(()=>{localStorage.setItem("dx.ai.topK",String(topK));},[topK]);
  const [minSim,setMinSim]=useState(()=>Number(localStorage.getItem("dx.ai.minSim")||0.35)); useEffect(()=>{localStorage.setItem("dx.ai.minSim",String(minSim));},[minSim]);

  /* ===== Hands-Free (wake word) ===== */
  const [wakeEnabled,setWakeEnabled]=useState(()=>localStorage.getItem("dx.ai.wake.enabled")!=="false"); useEffect(()=>{localStorage.setItem("dx.ai.wake.enabled",String(wakeEnabled));},[wakeEnabled]);
  const [wakeName,setWakeName]=useState(()=>localStorage.getItem("dx.ai.wake.name")||"Dex"); useEffect(()=>{localStorage.setItem("dx.ai.wake.name",wakeName);},[wakeName]);
  const [wakeStatus,setWakeStatus]=useState("off");
  const recRef=useRef(null);
  const questionRef=useRef("");
  const wakeActiveRef=useRef(false);

  const secureOk=useMemo(()=>{
    try{
      const isLocalhost=typeof window!=="undefined"&&/^https?:\/\/(localhost|127\.0\.0\.1)/.test(window.location.href);
      return(typeof window!=="undefined"&&(window.isSecureContext||isLocalhost));
    }catch{return false;}
  },[]);
  const RecognitionCtor=useMemo(()=>{
    try{return (window.SpeechRecognition||window.webkitSpeechRecognition);}catch{return null;}
  },[]);

  /* TTS status polling */
  const [ttsStatus,setTtsStatus]=useState({speaking:false,paused:false});
  useEffect(()=>{
    const id=setInterval(()=>{try{const s=window.speechSynthesis; setTtsStatus({speaking:!!s?.speaking,paused:!!s?.paused});}catch{}},350);
    return()=>clearInterval(id);
  },[]);

  const scrollRef=useRef(null);
  useEffect(()=>{scrollRef.current?.scrollIntoView?.({behavior:"smooth"});},[history,busy]);

  const disabled=useMemo(()=>!q||q.trim().length<3||busy,[q,busy]);
  const statusDot=busy?"bg-amber-500":err?"bg-rose-500":"bg-emerald-500";

  const pickVoiceAuto=(lang)=>{
    if(voiceName) return voiceName;
    const v=pickVoiceByGender(voices,lang,voiceGender);
    return v?.name||"";
  };
  const localeGreetings=(lang)=>{
    const custom=greetCustom?.[lang];
    if(custom?.pre||custom?.post){
      return {pre:custom.pre||DEFAULT_GREETINGS[lang]?.pre||"Hello.",post:custom.post||DEFAULT_GREETINGS[lang]?.post||"Anything else?"};
    }
    return DEFAULT_GREETINGS[lang]||DEFAULT_GREETINGS["en-IN"];
  };

  /* ===== awaitable TTS helper ===== */
  const say=(text,{interrupt=true}={})=>new Promise((resolve)=>{
    try{
      const u=new SpeechSynthesisUtterance(text);
      const toneOpts=TONES[tone]||TONES.neutral;
      u.lang=voiceLang; u.rate=toneOpts.rate; u.pitch=toneOpts.pitch; u.volume=toneOpts.volume;
      const vName=(voiceName||(pickVoiceByGender(voices,voiceLang,voiceGender)?.name))||"";
      const chosen=(voices||[]).find((v)=>v.name===vName);
      if(chosen) u.voice=chosen;
      u.onend=()=>resolve(); u.onerror=()=>resolve();
      try{if(interrupt) window.speechSynthesis?.cancel();}catch{}
      window.speechSynthesis?.speak(u);
      try{avatarRef.current?.speak?.(text);}catch{}
    }catch{resolve();}
  });

  const speakAll=(text,{interrupt})=>{
    try{
      const vName=pickVoiceAuto(voiceLang);
      const toneOpts=TONES[tone]||TONES.neutral;
      voice?.speak?.(text,vName,{...toneOpts,lang:voiceLang,interrupt});
      avatarRef.current?.speak?.(text);
    }catch{}
  };

  /* ================== AI send ================== */
  const send=async(text)=>{
    setErr(""); setBusy(true);
    const body={
      query:text,
      mode,
      topK:mode==="rag"?Math.max(0,Number(topK)||0):0,
      minSim:mode==="rag"?Math.max(0,Math.min(0.99,Number(minSim)||0)):0.6,
      equipment:mode==="ops"?(equipment||undefined):undefined,
      userId:userId||undefined
    };
    const newHist=[...history,{role:"user",contentHtml:mdToHtml(text)}];
    setHistory(newHist);

    const p=(async()=>{
      let bearer=import.meta.env.VITE_SUPABASE_ANON_KEY;
      try{
        const {data:{session}}=await supabase.auth.getSession();
        if(session?.access_token) bearer=session.access_token;
      }catch{}

      const r=await fetch(AI_ENDPOINT,{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${bearer}`},body:JSON.stringify(body)});
      const j=await r.json();
      if(!r.ok) throw new Error(j.error||"AI call failed");

      setLastCost(j.cost||null);
      setLastUsage(j.usage||null);
      setHistory([...newHist,{role:"assistant",contentHtml:mdToHtml(j.answer||""),sources:j.sources||[]}]);
      setLastAnswer(j.answer||"");

      // Try auto-attach flow if backend returned structured flow or answer contains flow JSON block
      let flowPayload=null;
      if(j.flow?.logs||j.flowLogs||j.logs||j.edges){ // structural fields
        const logs=j.flow?.logs||j.flowLogs||j.logs||j.edges||[];
        const norm=(logs||[]).map(normalizeLog).filter(Boolean);
        flowPayload={logs:norm,summary:j.flow?.summary||j.summary||null,details:j.flow?.details||j.details||[]};
      }else{
        flowPayload=tryParseFlowFromAnswer(j.answer||"");
      }
      if(flowPayload?.logs?.length){
        setFlowLogs(flowPayload.logs);
        setFlowSummary(flowPayload.summary||null);
        setFlowDetails(Array.isArray(flowPayload.details)?flowPayload.details:[]);
        setShowFlow(true);
      }

      if(autoSpeak&&j.answer){
        const vName=pickVoiceAuto(voiceLang);
        const {pre,post}=localeGreetings(voiceLang);
        setLastSpeak({voiceName:vName,tone,lang:voiceLang});
        if(greetOnSpeak){
          speakAll(pre,{interrupt:true});
          speakAll(j.answer,{interrupt:false});
          speakAll(post,{interrupt:false});
        }else{
          speakAll(j.answer,{interrupt:true});
        }
      }
      return j;
    })();

    await toast.promise(p,{loading:"Asking DigitizerX…",success:"Answer ready",error:"Request failed"});
    setBusy(false);
  };

  const ask=async()=>{
    const text=String(q||"").trim(); if(!text) return;
    setQ("");
    setHistory((h)=>[...h,{role:"assistant",contentHtml:mdToHtml(""),sources:[],_skeleton:true}]);
    await send(text);
    setHistory((h)=>{const i=h.findIndex((x)=>x._skeleton); if(i>-1){const cp=[...h]; cp.splice(i,1); return cp;} return h;});
  };
  const regenerate=async()=>{
    const lastUser=[...history].reverse().find((h)=>h.role==="user");
    if(lastUser){
      const txt=lastUser.contentHtml.replace(/<br\/?>/g,"\n").replace(/<[^>]*>/g,"");
      await send(txt);
    }
  };
  const copyLast=async()=>{
    const a=[...history].reverse().find((h)=>h.role==="assistant");
    if(a?.contentHtml){
      const tmp=a.contentHtml.replace(/<br\/?>/g,"\n").replace(/<[^>]*>/g,"");
      try{await navigator.clipboard.writeText(tmp); toast.success?.("Copied");}catch{}
    }
  };

  /* ================== Push-to-talk mic ================== */
  const onMicDown=()=>{if(!holdToTalk) return; voice?.setConfig?.({lang:voiceLang}); voice?.start?.();};
  const onMicUp=()=>{if(!holdToTalk) return; voice?.stop?.(async(heard)=>{const text=String(heard||"").trim(); if(text){setQ(""); await send(text);}});};
  const onMicClick=()=>{if(holdToTalk) return; if(voiceState.isRecording){onMicUp();}else{voice?.setConfig?.({lang:voiceLang}); voice?.start?.();}};

  /* ================== TTS transport ================== */
  const ttsPause=()=>{try{window.speechSynthesis?.pause(); avatarRef.current?.pause?.();}catch{}};
  const ttsResume=()=>{try{window.speechSynthesis?.resume(); avatarRef.current?.resume?.();}catch{}};
  const ttsStop=()=>{try{window.speechSynthesis?.cancel(); avatarRef.current?.stop?.();}catch{}};
  const ttsRestart=()=>{
    try{
      window.speechSynthesis?.cancel();
      if(!lastAnswer) return;
      const vName=lastSpeak.voiceName||pickVoiceAuto(lastSpeak.lang||voiceLang);
      const toneOpts=TONES[lastSpeak.tone||tone]||TONES.neutral;
      voice?.speak?.(lastAnswer,vName,{...toneOpts,lang:lastSpeak.lang||voiceLang,interrupt:true});
      avatarRef.current?.speak?.(lastAnswer);
    }catch{}
  };

  const previewVoice=()=>{
    const vName=pickVoiceAuto(voiceLang);
    const toneOpts=TONES[tone]||TONES.neutral;
    const {pre,post}=localeGreetings(voiceLang);
    const sample=`${pre} This is a preview in your selected voice and tone. ${post}`;
    voice?.speak?.(sample,vName,{...toneOpts,lang:voiceLang,interrupt:true});
    avatarRef.current?.speak?.(sample);
    setLastSpeak({voiceName:vName,tone,lang:voiceLang});
  };

  /* ================== Greetings export/import ================== */
  const exportGreetings=()=>{
    const data={defaults:DEFAULT_GREETINGS,custom:greetCustom};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download="digitizerx-greetings.json"; a.click();
    URL.revokeObjectURL(url);
  };
  const importInputRef=useRef(null);
  const importGreetings=(file)=>{
    if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const parsed=JSON.parse(String(reader.result||"{}"));
        const custom=parsed?.custom||parsed;
        const ok={};
        for(const loc of LOCALES.map((l)=>l.v)){
          const ent=custom?.[loc];
          if(ent&&(typeof ent.pre==="string"||typeof ent.post==="string")){
            ok[loc]={};
            if(typeof ent.pre==="string") ok[loc].pre=ent.pre;
            if(typeof ent.post==="string") ok[loc].post=ent.post;
          }
        }
        setGreetCustom(ok);
        toast.success?.("Imported greetings");
      }catch{toast.error?.("Invalid JSON");}
    };
    reader.readAsText(file);
  };
  const applyPreset=(name)=>{
    const p=PRESETS[name]; if(!p) return;
    setTopK(p.topK); setMinSim(p.minSim);
  };

  /* ================== Hands-Free internals (unchanged core) ================== */
  const stopWake=()=>{
    wakeActiveRef.current=false;
    try{
      if(recRef.current){
        try{recRef.current.onend=null;}catch(e){}
        try{if(recRef.current.stop) recRef.current.stop();}catch(e){}
      }
    }finally{
      recRef.current=null;
      setWakeStatus(wakeEnabled?"idle":"off");
    }
  };
  const beginQuestionListening=()=>{
    questionRef.current="";
    try{
      if(!RecognitionCtor) throw new Error("No RecognitionCtor");
      const rec=new RecognitionCtor();
      rec.lang=voiceLang; rec.continuous=false; rec.interimResults=true; rec.maxAlternatives=1;
      let lastInterim=""; let stopTimer=null;
      const armStopTimer=()=>{if(stopTimer) return; stopTimer=setTimeout(()=>{try{rec.stop();}catch{}},8000);};
      rec.onspeechstart=()=>{}; rec.onspeechend=()=>{try{rec.stop();}catch{}};
      rec.onnomatch=()=>{};
      rec.onresult=(ev)=>{
        for(let i=ev.resultIndex;i<ev.results.length;i++){
          const res=ev.results[i];
          const text=String(res[0]?.transcript||"");
          if(res.isFinal) questionRef.current+=text+" ";
          else lastInterim=text;
        }
        armStopTimer();
      };
      rec.onerror=(e)=>{const errText=e?.error||"unknown"; console.debug("wake.onerror question",errText);};
      rec.onend=()=>{
        if(stopTimer){clearTimeout(stopTimer); stopTimer=null;}
        let text=(questionRef.current||"").trim();
        if(!text&&lastInterim) text=lastInterim.trim();
        if(!text){
          (async()=>{
            await say("Sorry, I didn't catch that. Please try again.");
            if(wakeEnabled){setWakeStatus("idle"); startWake();}else{setWakeStatus("off");}
          })();
          return;
        }
        finalizeQuestionAndSend(text);
      };
      try{rec.start();}catch{}
      recRef.current=rec; setWakeStatus("listening");
    }catch(e){
      console.warn("beginQuestionListening failed",e);
      setWakeStatus("idle");
      if(wakeEnabled) startWake();
    }
  };
  const finalizeQuestionAndSend=(raw)=>{
    const text=String(raw||"").replace(/\s+/g," ").trim();
    const words=text?text.split(/\s+/).filter(Boolean):[];
    const ok=(text.length>=4)||(words.length>=2);
    if(!ok){
      (async()=>{
        await say("Could you repeat that?");
        if(wakeEnabled){setWakeStatus("idle"); startWake();}else{setWakeStatus("off");}
      })();
      return;
    }
    setWakeStatus("thinking");
    send(text).finally(()=>{
      const rearm=()=>{
        if(wakeEnabled){setWakeStatus("idle"); startWake();}else{setWakeStatus("off");}
      };
      try{
        const s=window.speechSynthesis;
        if(s){
          const id=setInterval(()=>{if(!s.speaking&&!s.pending){clearInterval(id); rearm();}},250);
          setTimeout(()=>clearInterval(id),8000);
        }else{rearm();}
      }catch{rearm();}
    });
  };
  const startWake=()=>{
    if(!wakeEnabled){setWakeStatus("off"); return;}
    if(!secureOk){console.warn("Wake disabled: insecure context"); setWakeStatus("off"); return;}
    if(!micSupported){console.warn("Wake disabled: mic not supported"); setWakeStatus("off"); return;}
    if(!RecognitionCtor){console.warn("Wake disabled: no SpeechRecognition"); setWakeStatus("off"); return;}
    stopWake();
    try{
      const rec=new RecognitionCtor();
      rec.lang=voiceLang; rec.continuous=true; rec.interimResults=true; rec.maxAlternatives=1;
      rec.onresult=(ev)=>{
        for(let i=ev.resultIndex;i<ev.results.length;i++){
          const res=ev.results[i];
          const t=String(res[0]?.transcript||"").trim().toLowerCase();
          const name=String(wakeName||"").trim().toLowerCase();
          if(!name) continue;
          if(res.isFinal&&t.includes(name)){
            stopWake(); setWakeStatus("listening");
            (async()=>{await say("I'm listening. What would you like to know?"); beginQuestionListening();})();
            return;
          }
        }
      };
      rec.onerror=(e)=>{const errText=e?.error||"unknown"; console.debug("wake.onerror",errText);};
      rec.onend=()=>{if(wakeEnabled&&wakeActiveRef.current){try{rec.start();}catch{}}};
      try{rec.start();}catch{}
      recRef.current=rec; wakeActiveRef.current=true; setWakeStatus("idle");
    }catch(e){
      console.warn("startWake failed",e);
      setWakeStatus("off");
    }
  };
  useEffect(()=>{if(wakeEnabled) startWake(); else stopWake(); return()=>stopWake();},[wakeEnabled,voiceLang]); // eslint-disable-line

  /* ================== UI ================== */
  return(
    <div className="w-full max-w-5xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="rounded-2xl p-4 md:p-5 mb-4 bg-gradient-to-r from-blue-700 to-blue-800 text-white shadow">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 text-white flex items-center justify-center shadow"><Sparkles size={18}/></div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl md:text-2xl font-semibold">{title} <span className="opacity-80">({mode.toUpperCase()})</span></h3>
                <BrandBadge><ShieldCheck size={12}/> Audit-Logged</BrandBadge>
                <span className={`inline-block w-2 h-2 rounded-full ${statusDot}`} title={busy?"Working…":err?"Error":"Ready"}/>
              </div>
              <div className="mt-1 text-[12px] text-white/80 flex items-center gap-2"><Info size={12}/> Press <b>Ctrl+Enter</b> to send. Validate per SOP.</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ModePill mode={mode} setMode={setMode}/>
            <button type="button" onClick={()=>setShowAvatar((v)=>!v)} aria-pressed={showAvatar}
              className={`h-9 px-2 rounded-md border flex items-center gap-1 transition ${showAvatar?"bg-white text-blue-700 border-white/60 ring-2 ring-white/70":"bg-white/10 text-white border-white/30 hover:bg-white/20 active:scale-[0.98]"}`} title="Toggle avatar panel">
              <Video size={14}/> {showAvatar?"Hide Avatar":"Show Avatar"}
            </button>
            <button type="button" onClick={()=>setShowFlow((v)=>!v)} aria-pressed={showFlow}
              className={`h-9 px-2 rounded-md border flex items-center gap-1 transition ${showFlow?"bg-white text-blue-700 border-white/60 ring-2 ring-white/70":"bg-white/10 text-white border-white/30 hover:bg-white/20 active:scale-[0.98]"}`} title="Toggle process flow">
              <GitBranch size={14}/> {showFlow ? "Hide Flow" : "Show Flow"}
            </button>
            <Link
              to="/ai/pallet"
              className="h-9 px-2 rounded-md border bg-white/10 text-white border-white/30 flex items-center gap-1 hover:bg-white/20 active:scale-[0.98]"
              title="Open palletization-only AI report"
            >
              <ClipboardList size={14}/> Pallet Report
            </Link>
          </div>
        </div>

        {/* Toolbar (aligned fields) */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {mode==="ops"&&(
            <div className="relative shrink-0">
              <Wrench size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-200"/>
              <input className="text-xs border rounded-lg pl-8 pr-3 py-2 w-56 bg-white text-slate-900" placeholder="EQUIP-123 (optional)" value={equipment} onChange={(e)=>setEquipment(e.target.value)}/>
            </div>
          )}

          <div className="text-[12px] hidden md:flex items-center gap-2">
            <Clock size={12} className="text-blue-200"/>
            <span>{mode==="rag"?"RAG: answers cite indexed PDFs.":"No RAG citations."}</span>
          </div>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Field icon={ListFilter} title="Retrieval preset">
              <select onChange={(e)=>applyPreset(e.target.value)} defaultValue="" className="text-[12px] bg-transparent outline-none h-full">
                <option value="" disabled>Preset</option>
                <option value="Strict">Strict</option>
                <option value="Balanced">Balanced</option>
                <option value="Exploratory">Exploratory</option>
              </select>
            </Field>
            <Field icon={SlidersHorizontal} title="How many chunks to retrieve">
              <input type="number" min={3} max={50} value={topK} placeholder="TopK" onChange={(e)=>setTopK(Math.max(3,Math.min(50,Number(e.target.value)||12)))} className="w-16 text-[12px] bg-transparent outline-none h-full"/>
            </Field>
            <Field icon={SlidersHorizontal} title="Similarity threshold (lower = more inclusive)">
              <input type="number" step="0.05" min={0} max={0.99} value={minSim} placeholder="MinSim" onChange={(e)=>setMinSim(Math.max(0,Math.min(0.99,Number(e.target.value)||0.35)))} className="w-20 text-[12px] bg-transparent outline-none h-full"/>
            </Field>

            {/* Hands-Free */}
            <label className={`h-9 inline-flex items-center gap-1 select-none shrink-0 px-2 rounded-md border transition ${wakeEnabled?"bg-blue-700 text-white border-blue-500 ring-2 ring-blue-400":"bg-white/10 text-white border-white/30 hover:bg-white/20"}`} title="Say the wake word to ask hands-free">
              <Headphones size={14} className="mr-1"/>
              <input type="checkbox" checked={wakeEnabled} onChange={(e)=>setWakeEnabled(e.target.checked)} className="accent-white mr-1"/>
              Hands-Free
            </label>
            <Field icon={User} title="Wake word">
              <input value={wakeName} onChange={(e)=>setWakeName(e.target.value)} placeholder="Alexa" className="text-[12px] bg-transparent outline-none h-full w-24"/>
            </Field>
            <span className={`h-9 inline-flex items-center gap-2 px-3 rounded-md border border-white/30 text-[12px] ${wakeStatus==="thinking"?"bg-amber-500/20":"bg-white/10"} text-white`} title="Hands-free status">
              <span className={`w-2 h-2 rounded-full ${wakeStatus==="off"?"bg-slate-400":wakeStatus==="idle"?"bg-emerald-400":wakeStatus==="listening"?"bg-amber-400":"bg-blue-300"}`}/>
              {wakeStatus}
            </span>

            {/* Hold-to-talk */}
            <label className={`h-9 inline-flex items-center gap-1 select-none shrink-0 px-2 rounded-md border transition ${holdToTalk?"bg-blue-700 text-white border-blue-500 ring-2 ring-blue-400":"bg-white/10 text-white border-white/30 hover:bg-white/20"}`} title="Hold mouse/touch to talk">
              <Mic size={14} className="mr-1"/>
              <input type="checkbox" checked={holdToTalk} onChange={(e)=>setHoldToTalk(e.target.checked)} className="accent-white mr-1"/>
              Hold-to-talk
            </label>

            {/* Language/Gender/Tone/Voice */}
            <Field icon={Languages} title="Recognition / TTS language">
              <select value={voiceLang} onChange={(e)=>setVoiceLang(e.target.value)} className="text-[12px] bg-transparent outline-none h-full min-w-[160px]">
                {LOCALES.map((o)=>(<option key={o.v} value={o.v}>{o.label}</option>))}
              </select>
            </Field>
            <Field icon={User} title="Prefer male/female voice (if available)">
              <select value={voiceGender} onChange={(e)=>setVoiceGender(e.target.value)} className="text-[12px] bg-transparent outline-none h-full min-w-[120px]">
                <option value="auto">Female/Male: Auto</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </Field>
            <Field icon={Sparkles} title="TTS tone preset">
              <select value={tone} onChange={(e)=>setTone(e.target.value)} className="text-[12px] bg-transparent outline-none h-full min-w-[120px]">
                {Object.keys(TONES).map((k)=>(<option key={k} value={k}>{k[0].toUpperCase()+k.slice(1)}</option>))}
              </select>
            </Field>
            <Field icon={AudioLines} title="Pick a specific TTS voice">
              <select value={voiceName} onChange={(e)=>setVoiceName(e.target.value)} className="text-[12px] bg-transparent outline-none h-full min-w-[200px]">
                <option value="">Auto voice (use gender+lang)</option>
                {(voices||[]).map((v)=>(<option key={v.name+"|"+v.lang} value={v.name}>{v.name} ({v.lang})</option>))}
              </select>
            </Field>

            {/* Auto-speak/Greet */}
            <label className={`h-9 inline-flex items-center gap-1 select-none shrink-0 px-2 rounded-md border transition ${autoSpeak?"bg-blue-700 text-white border-blue-500 ring-2 ring-blue-400":"bg-white/10 text-white border-white/30 hover:bg-white/20"}`}>
              <Volume2 size={14} className="mr-1"/>
              <input type="checkbox" checked={autoSpeak} onChange={(e)=>setAutoSpeak(e.target.checked)} className="accent-white mr-1"/>
              Auto-speak
            </label>
            <label className={`h-9 inline-flex items-center gap-1 select-none shrink-0 px-2 rounded-md border transition ${greetOnSpeak?"bg-blue-700 text-white border-blue-500 ring-2 ring-blue-400":"bg-white/10 text-white border-white/30 hover:bg-white/20"}`}>
              <Sparkles size={14} className="mr-1"/>
              <input type="checkbox" checked={greetOnSpeak} onChange={(e)=>setGreetOnSpeak(e.target.checked)} className="accent-white mr-1"/>
              Greet
            </label>

            <button type="button" onClick={()=>setShowGreetEditor((v)=>!v)} className={`h-9 px-2 rounded-md border flex items-center gap-1 shrink-0 transition ${showGreetEditor?"bg-white text-blue-700 border-white/60 ring-2 ring-white/70":"bg-white/10 text-white border-white/30 hover:bg-white/20"}`} title="Customize greetings">
              <SlidersHorizontal size={14}/> Customize
            </button>
            <button type="button" onClick={previewVoice} className="h-9 px-2 rounded-md border bg-white/10 text-white border-white/30 flex items-center gap-1 shrink-0 hover:bg-white/20 active:scale-[0.98]" title="Preview voice">
              <Volume2 size={14}/> Preview
            </button>

            {/* Mic */}
            <button type="button"
              onMouseDown={onMicDown} onMouseUp={onMicUp} onMouseLeave={()=>{if(holdToTalk&&voiceState.isRecording){onMicUp();}}}
              onTouchStart={onMicDown} onTouchEnd={onMicUp}
              onClick={onMicClick} disabled={!micSupported} aria-pressed={voiceState.isRecording}
              className={`h-9 px-2 rounded-md border flex items-center gap-2 shrink-0 transition ${voiceState.isRecording?"bg-rose-600 text-white border-rose-300 ring-2 ring-rose-300":"bg-white/10 text-white border-white/30 hover:bg-white/20 active:scale-[0.98]"} disabled:opacity-40`}
              title={micSupported?(holdToTalk?"Hold to talk":"Tap to start/stop"):"Mic not supported in this browser"}>
              <Mic size={14}/><span className="text-[12px]">{voiceState.isRecording?"Listening…":"Voice"}</span>
              {voiceState.isRecording&&(<span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"/>)}
            </button>
          </div>
        </div>

        {/* Greeting editor */}
        {showGreetEditor&&(
          <div className="mt-3 p-3 rounded-lg border border-white/30 bg-white/10 text-[12px] text-white">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <div className="font-semibold flex items-center gap-2">Custom Greetings (per language)</div>
              <div className="flex items-center gap-2">
                <button onClick={exportGreetings} className="h-9 px-2 rounded-md border bg-white/10 text-white border-white/30 flex items-center gap-1 hover:bg-white/20" title="Export greetings JSON"><Download size={14}/> Export</button>
                <input ref={importInputRef} type="file" accept="application/json" hidden onChange={(e)=>importGreetings(e.target.files?.[0])}/>
                <button onClick={()=>importInputRef.current?.click()} className="h-9 px-2 rounded-md border bg-white/10 text-white border-white/30 flex items-center gap-1 hover:bg-white/20" title="Import greetings JSON"><Upload size={14}/> Import</button>
                <button onClick={()=>setGreetCustom({})} className="h-9 px-2 rounded-md border bg-white/10 text-white border-white/30 hover:bg-white/20">Reset all</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {LOCALES.map((loc)=>{
                const code=loc.v;
                const def=DEFAULT_GREETINGS[code]||{pre:"Hello.",post:"Anything else?"};
                const custom=greetCustom?.[code]||{pre:"",post:""};
                return(
                  <div key={code} className="rounded-md border border-white/30 bg-white/5 p-2">
                    <div className="mb-1 font-medium">{loc.label} <span className="opacity-70 text-[11px]">({code})</span></div>
                    <div className="space-y-2">
                      <div>
                        <div className="opacity-80 mb-1">Before answer</div>
                        <input className="w-full rounded-md border bg-white text-slate-900 px-2 py-1" placeholder={def.pre} value={custom.pre} onChange={(e)=>setGreetCustom((g)=>({...g,[code]:{...(g?.[code]||{}),pre:e.target.value}}))}/>
                      </div>
                      <div>
                        <div className="opacity-80 mb-1">After answer</div>
                        <input className="w-full rounded-md border bg-white text-slate-900 px-2 py-1" placeholder={def.post} value={custom.post} onChange={(e)=>setGreetCustom((g)=>({...g,[code]:{...(g?.[code]||{}),post:e.target.value}}))}/>
                      </div>
                      <div className="flex gap-2">
                        <button className="px-2 py-1 rounded-md border bg-white/10 text-white border-white/30 hover:bg-white/20" onClick={()=>setGreetCustom((g)=>{const cp={...(g||{})}; delete cp[code]; return cp;})}>Reset</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Avatar panel */}
      {showAvatar&&(
        <div className="mb-3 flex justify-end">
          <AiAvatarPanel ref={avatarRef} onReady={()=>{}}/>
        </div>
      )}

      {/* Quick chips */}
      <div className="mb-3"><QuickChips mode={mode} onPick={(t)=>setQ(t)}/></div>

      {/* Chat area */}
      <Card className="p-3 md:p-4 mb-4">
        {history.length===0&&(
          <div className="text-sm text-slate-600 space-y-2 mb-2">
            <Hint icon={Database}>Use <b>RAG</b> for SOP/label Q&amp;A with page-cited sources.</Hint>
            <Hint icon={Cpu}>Use <b>OPS</b> for live questions like “yesterday breakdowns” or “next PM for EQUIP-123”.</Hint>
            <Hint icon={Sparkles}>Use <b>GEN</b> for GMP-friendly drafts (labels, checklists, text).</Hint>
          </div>
        )}
        {history.map((m,idx)=>(<div key={idx}>{m._skeleton?<SkeletonAnswer/>:<Bubble role={m.role} childrenHtml={m.contentHtml}/>} {m.role==="assistant"&&<SourcePills sources={m.sources}/>}</div>))}
        {busy&&history.length===0&&(<SkeletonAnswer/>)}
        <div ref={scrollRef}/>
        {history.length>0&&history[history.length-1]?.sources?.length>0&&(<PreviewTable sources={history[history.length-1].sources}/>)}
      </Card>

      {/* Flow panel (InboundPOFlow) */}
      {showFlow && (
        <Card className="p-3 md:p-4 mb-4">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <div className="flex items-center gap-2">
              <GitBranch size={16} className="text-blue-700" />
              <div className="font-semibold">Process Flow</div>
              <span className="text-[12px] text-slate-500">
                Visualizes the live inbound stages for a PO (via <code>get_inbound_flow_by_po</code>)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <FileText size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-blue-600" />
                <input
                  value={flowPo}
                  onChange={(e)=>setFlowPo(e.target.value)}
                  placeholder="Enter PO (e.g., MFI/25/PO/00079)"
                  className="text-xs border rounded-lg pl-7 pr-2 py-1.5 w-72 bg-white text-slate-900"
                />
              </div>
            </div>
          </div>

          <InboundPOFlow poNo={flowPo} stageHeightVh={56} autoFetch showExport />
        </Card>
      )}

      {/* Composer */}
      <div className="rounded-2xl border shadow-sm bg-white p-3 md:p-4">
        <div className="flex items-start gap-3">
          <div className="relative flex-1">
            <Sparkles size={16} className="absolute left-3 top-3 text-blue-600"/>
            <textarea value={q} onChange={(e)=>setQ(e.target.value)}
              onKeyDown={(e)=>{if(e.key==="Enter"&&e.ctrlKey&&!disabled){ask();}}}
              placeholder={mode==="rag"?"Ask about SOPs/docs… (Ctrl+Enter to send)":"Ask a question or instruction…"}
              className="flex-1 h-24 md:h-28 border rounded-xl pl-9 pr-3 py-3 focus:outline-none focus:ring" disabled={busy}/>
          </div>
          <Button onClick={ask} disabled={disabled} className="self-stretch w-[120px] rounded-xl bg-blue-700 text-white hover:bg-blue-800">
            {busy?(<><Loader2 className="animate-spin mr-2" size={16}/>Sending</>):(<><Send size={16} className="mr-2"/>Send</>)}
          </Button>
        </div>
        <div className="mt-2 text-[12px] text-slate-500 flex items-center gap-2"><Info size={12}/> Ctrl+Enter to send · Answers may contain regulated content; validate per SOP.</div>
      </div>

      <div className="mt-3 text-[11px] text-slate-500 flex items-center gap-2">
        <ShieldCheck size={12}/> Compliant assistant (GxP, 21 CFR Part 11, GAMP 5). Logged in <code>ai_audit_logs</code>.
      </div>

      {/* Floating transport */}
      <FloatingTransport visible={ttsStatus.speaking||ttsStatus.paused} paused={ttsStatus.paused} onPause={ttsPause} onResume={ttsResume} onStop={ttsStop} onRestart={ttsRestart}/>

      <CostBadge cost={lastCost} usage={lastUsage}/>
    </div>
  );
};

/* -------------------- Embedded Avatar Panel -------------------- */
const AiAvatarPanel=React.forwardRef(({onReady},ref)=>{
  const webglRef=React.useRef(null);
  React.useImperativeHandle(ref,()=>({
    speak:(text)=>webglRef.current?.speak?.(text),
    pause:()=>webglRef.current?.pause?.(),
    resume:()=>webglRef.current?.resume?.(),
    stop:()=>webglRef.current?.stop?.()
  }));
  React.useEffect(()=>{onReady?.();},[onReady]);
  return(
    <div className="w-full max-w-[360px] rounded-2xl overflow-hidden shadow border bg-white relative">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2 text-sm font-medium"><Video size={14}/> Avatar (local)</div>
        <span className="text-[11px] text-emerald-600">ready</span>
      </div>
      <div className="bg-black"><WebAvatar ref={webglRef}/></div>
    </div>
  );
});
/* ------------------ end embedded Avatar Panel ------------------ */

const FloatingTransport=({visible,paused,onPause,onResume,onStop,onRestart})=>{
  if(!visible) return null;
  return(
    <div className="fixed bottom-16 right-3 z-50">
      <div className="flex items-center gap-1 bg-slate-900/90 text-white rounded-full shadow-lg px-2 py-1 backdrop-blur-sm">
        <span className={`w-2 h-2 rounded-full ${paused?"bg-amber-400":"bg-emerald-400"} mr-1`} title={paused?"Paused":"Speaking"}/>
        <button onClick={onPause} disabled={paused} aria-label="Pause speech" title="Pause" className="h-7 w-7 rounded-full hover:bg-white/10 disabled:opacity-40 flex items-center justify-center"><Pause size={14}/></button>
        <button onClick={onResume} disabled={!paused} aria-label="Resume speech" title="Resume" className="h-7 w-7 rounded-full hover:bg-white/10 disabled:opacity-40 flex items-center justify-center"><Play size={14}/></button>
        <button onClick={onStop} aria-label="Stop speech" title="Stop" className="h-7 w-7 rounded-full hover:bg-white/10 disabled:opacity-40 flex items-center justify-center"><Square size={14}/></button>
        <button onClick={onRestart} aria-label="Restart speech" title="Restart" className="h-7 w-7 rounded-full hover:bg-white/10 disabled:opacity-40 flex items-center justify-center"><RotateCw size={14}/></button>
      </div>
    </div>
  );
};

export default AIChatPanel;
