// src/components/LandingPage.jsx
import React,{useState,useEffect,useRef} from "react";
import {Outlet,Link,useNavigate,useLocation} from "react-router-dom";
import {useAuth} from "../contexts/AuthContext";
import {
  Settings,Users,FileText,Package,FlaskConical,Scale,
  ChevronLeft,ChevronRight,Menu,UserCheck,QrCode,Search,Bot,LayoutDashboard
} from "lucide-react";
import Button from "./ui/Button";
import { Card } from "./ui/card"; // fixed casing to match other components
import logo from "../assets/logo.png";
import {supabase} from "../utils/supabaseClient";
import {resolveInputToPath} from "../utils/globalResolver";
import DebugOverlayTamer from "./common/DebugOverlayTamer";

/* ---------- modules list ---------- */
const modules=[
  {name:"Dashboard",icon:<LayoutDashboard size={22}/>,route:"dashboard",submodules:[]},
  {name:"Masters",icon:<Settings size={22}/>,route:"masters",submodules:["Plant Master","SubPlant Master","Department Master","Area Master","Location Master","Equipment Master","Uom Master","Material Management"]},
  {name:"User Authorization",icon:<Users size={22}/>,route:"user-authorization",submodules:["User Management","Role Management","Password Management","SuperAdmin Password Reset"]},
  {name:"Procurement",icon:<Package size={22}/>,route:"procurement",submodules:["Vendor Management","Product BOM","Invoice Management","Purchase Order"]},
  {name:"Engineering",icon:<FlaskConical size={22}/>,route:"engineering",submodules:["Asset Management","PM Scheduler","Work Orders Management","Inventory Spare Parts Management","Compliance Audit Module","Environmental Monitoring Integration","Breakdown Management"]},
  // HR menu aligned: removed "Leave Management", added "Employee Self Service"
  {name:"HR",icon:<UserCheck size={22}/>,route:"hr",submodules:[
    "HR Dashboard",
    "Attendance Management",
    "Employee Self Service",   // ✅ now visible in sidebar
    "Shift Schedule Management",
    "Payroll Management",
    "Paystub Editor",
    "Performance Review",
    "Recruitment Management",
    "Training Management",
    "HR Settings",
    "Announcements",
    "Document Management"
  ]},
  {name:"Document Management",icon:<FileText size={22}/>,route:"document-management",submodules:["Label Master","AI Assistant","AI Report","Check List Master"]},
  {name:"Material Inward",icon:<Package size={22}/>,route:"material-inward",submodules:[
    "Inbound Flow",            // ✅ new entry maps to /inbound-flow
    "Gate Entry",
    "Vehicle Inspection",
    "Material Inspection",
    "Weight Capture",
    "GRN Posting",
    "Label Printing",
    "Palletization"
  ]},
  {name:"Weighing Balance",icon:<Scale size={22}/>,route:"weighing-balance",submodules:["WeightBox Master","StandardWeight Master","Weighing Modules","DailyVerification Log","MonthlyCalibration Log"]}
];

const slug=(s)=>String(s||"").toLowerCase().replace(/\s+/g,"-");

function LandingPage(){
  const [activeModule,setActiveModule]=useState(null);
  const [collapsed,setCollapsed]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);

  const {session,logout}=useAuth();
  const navigate=useNavigate();
  const location=useLocation();
  const username=session?.user?.email?.split("@")[0]||"Admin";

  const [val,setVal]=useState("");
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const [attemptedLookup,setAttemptedLookup]=useState(false);

  const [manualAllowed,setManualAllowed]=useState(()=>{
    try{return JSON.parse(localStorage.getItem("dx.manualAllowed")??"true");}catch{return true;}
  });

  const [supportsDetector,setSupportsDetector]=useState(false);
  const [scanning,setScanning]=useState(false);
  const [scanErr,setScanErr]=useState("");

  const videoRef=useRef(null);
  const streamRef=useRef(null);
  const rafRef=useRef(0);
  const detectorRef=useRef(null);
  const inputRef=useRef(null);

  useEffect(()=>{localStorage.setItem("dx.manualAllowed",JSON.stringify(manualAllowed));},[manualAllowed]);
  useEffect(()=>{setSupportsDetector(typeof window!=="undefined"&&"BarcodeDetector"in window);},[]);
  useEffect(()=>()=>stopScan(),[]);
  useEffect(()=>{
    if(collapsed||(!mobileOpen&&typeof window!=="undefined"&&window.innerWidth<768)){stopScan();}
  },[collapsed,mobileOpen]);
  useEffect(()=>{setErr("");setAttemptedLookup(false);},[location.pathname,location.search]);
  useEffect(()=>{setMobileOpen(false);},[location.pathname]);

  useEffect(()=>{
    const h=(e)=>{
      const key=String(e?.key??"").toLowerCase();
      const ctrl=e?.ctrlKey||e?.metaKey;
      if(ctrl&&key==="k"){e?.preventDefault?.();inputRef.current?.focus?.();}
      if(ctrl&&key==="d"){e?.preventDefault?.();navigate("/dashboard");}
      if(key==="escape"&&scanning){stopScan();}
    };
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  },[scanning,navigate]);

  const handleLogout=async()=>{await logout();navigate("/login");};

  const toRoute=(modRoute,sub)=>
    modRoute==="dashboard"?"/dashboard":
    // special cases / weighing balance deep-links
    sub==="Weighing Modules"?"/weighing-balance/weighing-modules":
    sub==="DailyVerification Log"?"/weighing-balance/dailyverification-log":
    sub==="MonthlyCalibration Log"?"/weighing-balance/monthlycalibration-log":
    // HR
    modRoute==="hr"&&sub==="Document Management"?"/hr/hr-document-management":
    // Engineering
    sub==="Breakdown Management"?"/engineering/breakdown-management":
    // NEW: Inbound Flow goes to the dedicated page route
    (modRoute==="material-inward"&&sub==="Inbound Flow")?"/inbound-flow":
    // default dynamic route (ModuleRenderer)
    `/${modRoute}/${slug(sub)}`;

  const startScan=async()=>{
    setScanErr("");
    if(!supportsDetector){navigate("/scan");return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});
      streamRef.current=stream;
      if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play();}
      detectorRef.current=new window.BarcodeDetector({formats:["qr_code"]});
      setScanning(true);
      const tick=async()=>{
        if(!scanning||!videoRef.current)return;
        try{
          const codes=await detectorRef.current.detect(videoRef.current);
          const text=codes?.[0]?.rawValue||"";
          if(text){await handleLookup(text,"scan");return;}
        }catch{}
        rafRef.current=requestAnimationFrame(tick);
      };
      rafRef.current=requestAnimationFrame(tick);
    }catch(e){
      setScanErr(e?.message||"Camera/scan not available");
      setScanning(false);
    }
  };

  const stopScan=()=>{
    if(rafRef.current)cancelAnimationFrame(rafRef.current);
    rafRef.current=0;
    if(videoRef.current){try{videoRef.current.pause();}catch{}videoRef.current.srcObject=null;}
    if(streamRef.current){for(const t of streamRef.current.getTracks?.()||[])t.stop();streamRef.current=null;}
    setScanning(false);
  };

  const handleLookup=async(raw,source="manual")=>{
    if(source==="manual"&&!manualAllowed)return;
    const input=String((raw??val)||"").trim();
    if(!input)return;

    if(/^dash(board)?$/i.test(input)){
      navigate("/dashboard");setVal("");stopScan();setAttemptedLookup(false);return;
    }

    setErr("");setAttemptedLookup(true);setBusy(true);
    try{
      const path=await resolveInputToPath(input,supabase);
      if(path){navigate(path);setVal("");stopScan();setAttemptedLookup(false);}
      else{setErr("No match found. Try another code or scan.");}
    }finally{setBusy(false);}
  };

  return(
    <div className="flex h-screen bg-white">
      {/* Dev-only HUD controller (safe) */}
      <DebugOverlayTamer/>

      {/* Sidebar */}
      <aside
        className={`bg-blue-800 text-white flex flex-col min-w-[16rem] fixed md:relative z-40 h-full transition-transform duration-300 ease-in-out ${mobileOpen?"translate-x-0":"-translate-x-full md:translate-x-0"}`}
        style={{width:collapsed?"5rem":"16rem"}}
      >
        <div className="flex items-center justify-center p-4 border-b border-white/10">
          {!collapsed&&<h2 className="font-bold text-lg">Modules</h2>}
        </div>

        {/* Global Scan & Lookup */}
        {!collapsed&&(
          <div className="p-3 border-b border-white/10">
            <div className="text-xs uppercase tracking-wide opacity-80 mb-2 flex items-center gap-1">
              <QrCode size={14}/> Scan &amp; lookup
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2 top-2.5 opacity-80"/>
                <input
                  ref={inputRef}
                  value={val}
                  onChange={(e)=>setVal(e.target.value)}
                  onKeyDown={(e)=>e.key==="Enter"&&handleLookup(undefined,"manual")}
                  placeholder="Enter WO code, equipment ID/serial/UUID, or scan"
                  className="w-full text-sm text-slate-900 placeholder:text-slate-500 pl-7 pr-2 py-1.5 rounded border border-white/20 focus:border-white/40 bg-white"
                  disabled={busy}
                  aria-label="Global scan & lookup"
                />
              </div>
              <button
                onClick={()=>handleLookup(undefined,"manual")}
                disabled={busy||!val.trim()}
                className="px-3 py-1.5 rounded bg-white text-blue-800 text-sm hover:bg-blue-50 disabled:opacity-60"
                title="Open"
              >
                Open
              </button>
            </div>

            {attemptedLookup&&err&&<div className="text-[11px] mt-2 text-rose-200">{err}</div>}

            <div className="mt-2 flex items-center gap-2">
              <button onClick={scanning?stopScan:startScan} className="px-3 py-1.5 rounded bg-white text-blue-800 text-sm hover:bg-blue-50" title="Scan with camera">
                {scanning?"Stop camera":"Scan (camera)"}
              </button>

              <label className="ml-auto text[12px] text-[12px] flex items-center gap-2 select-none">
                <input type="checkbox" checked={manualAllowed} onChange={(e)=>setManualAllowed(e.target.checked)}/>
                Allow typing
              </label>
            </div>

            {scanning&&(
              <div className="mt-3">
                <div className="text-[11px] opacity-80 mb-1">Point the camera at a QR with a UUID/code. You can also type a WO code or equipment ID above.</div>
                <video ref={videoRef} className="w-full rounded border border-white/20" playsInline muted autoPlay/>
                {scanErr&&<div className="text-[11px] mt-2 text-rose-200">{scanErr}</div>}
              </div>
            )}

            {/* Quick chip to dashboard */}
            <div className="mt-2 flex justify-end">
              <button onClick={()=>navigate("/dashboard")} className="px-2 py-1 rounded bg-white text-blue-800 text-xs hover:bg-blue-50">Open Dashboard</button>
            </div>
          </div>
        )}

        {/* Modules nav */}
        <nav className="flex-1 p-3 overflow-y-auto">
          {modules.map((mod,index)=>(
            <div key={mod.name} className="mb-2">
              <Button
                variant="ghost"
                className={`flex items-center w-full px-3 py-2 rounded-lg transition ${activeModule===index?"bg-white/20":""}`}
                onClick={()=>mod.submodules.length?setActiveModule(activeModule===index?null:index):navigate(`/${mod.route}`)}
              >
                <div className="w-10 flex items-center justify-center">{mod.icon}</div>
                {!collapsed&&(<span className="ml-2 text-sm text-white flex-1 text-left">{mod.name}</span>)}
              </Button>

              {activeModule===index&&!collapsed&&mod.submodules.length>0&&(
                <div className="pl-12 mt-1 space-y-1">
                  {mod.submodules.map((sub)=>(
                    <div key={`${mod.route}-${sub}`}>
                      <Link to={toRoute(mod.route,sub)} className="block px-2 py-1 text-xs rounded hover:bg-white/10 transition text-white text-left">
                        <span className="inline-flex items-center gap-1">
                          {sub==="AI Assistant"&&<Bot size={12}/>}
                          {sub}
                        </span>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10 flex justify-center">
          <Button variant="ghost" size="icon" onClick={()=>setCollapsed(!collapsed)} className="bg-white/20 hover:bg-white/30 rounded-full transition" aria-label="Toggle sidebar">
            {collapsed?<ChevronRight size={18}/>:<ChevronLeft size={18}/>}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col ml-[16rem] md:ml-0">
        <header className="flex items-center justify-between bg-gray-100 shadow px-4 md:px-6 py-3">
          <Button variant="ghost" size="icon" onClick={()=>setMobileOpen(true)} className="md:hidden" aria-label="Open menu">
            <Menu size={24}/>
          </Button>

          <div className="flex-1 flex justify-center">
            <div className="flex items-center gap-4">
              <img src={logo} alt="Logo" className="w-16 h-auto"/>
              <h1 className="text-2xl font-bold text-blue-700">DigitizerX</h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button onClick={()=>navigate("/dashboard")} className="px-3 py-1">Dashboard</Button>
            <div className="text-right hidden md:block">
              <p className="text-sm font-semibold text-gray-700">{username}</p>
              <p className="text-xs text-gray-500">User</p>
            </div>
            <div className="w-8 h-8 bg-blue-700 text-white flex items-center justify-center rounded-full font-bold">
              {username?.[0]?.toUpperCase()||"A"}
            </div>
            <Button variant="destructive" onClick={handleLogout} className="px-3 py-1">Logout</Button>
          </div>
        </header>

        <main className="flex-1 bg-white overflow-auto">
          <div className="w-full px-4 md:px-8 py-6">
            <Card className="max-w-6xl mx-auto">
              <Outlet/>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}

export default LandingPage;
