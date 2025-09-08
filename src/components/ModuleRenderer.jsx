// src/components/ModuleRenderer.jsx
import React,{useMemo,useRef,useState,useEffect} from "react";
import {useParams,useLocation} from "react-router-dom";
import {Alert,AlertDescription,AlertTitle} from "./ui/alert";
import {AlertCircle,Eye,EyeOff} from "lucide-react";
import AIChatPanel from "./AIChatPanel.jsx";
import AiReport from "./AiReport.jsx";

/* ---------------- User Authorization ---------------- */
import UserManagement from "./submodules/UserAuthorization/UserManagement";
import RoleManagement from "./submodules/UserAuthorization/RoleManagement";
import PasswordManagement from "./submodules/UserAuthorization/PasswordManagement";
import SuperAdminPasswordReset from "./submodules/UserAuthorization/SuperAdminPasswordReset";

/* ---------------- Masters ---------------- */
import PlantMaster from "./submodules/masters/PlantMaster";
import SubPlantMaster from "./submodules/masters/SubPlantMaster";
import DepartmentMaster from "./submodules/masters/DepartmentMaster";
import AreaMaster from "./submodules/masters/AreaMaster";
import LocationMaster from "./submodules/masters/LocationMaster";
import EquipmentMaster from "./submodules/masters/EquipmentMaster";
import UomMaster from "./submodules/masters/UomMaster";
import MaterialManagement from "./submodules/masters/MaterialManagement.jsx";

/* ---------------- Document Management ---------------- */
import LabelMaster from "./submodules/DocumentManagement/LabelMaster";
import CheckListMaster from "./submodules/DocumentManagement/CheckListMaster.jsx";

/* ---------------- Weighing Balance ---------------- */
import WeightBoxMaster from "./submodules/weighingbalance/WeightBoxMaster.jsx";
import StandardWeightMaster from "./submodules/weighingbalance/StandardWeightMaster.jsx";
import WeighingModules from "./submodules/weighingbalance/WeighingModules.jsx";
import DailyVerificationLog from "./submodules/weighingbalance/DailyVerificationLog.jsx";
import MonthlyCalibrationProcess from "./submodules/weighingbalance/monthlycalibrationlog/MonthlyCalibrationProcess.jsx";

/* ---------------- HR ---------------- */
import HRDashboard from "./submodules/hr/HRDashboard";
import LeaveManagement from "./submodules/hr/LeaveManagement"; // kept for routing/back-compat
import AttendanceManagement from "./submodules/hr/AttendanceManagement";
import PayrollManagement from "./submodules/hr/PayrollManagement";
import PaystubEditor from "./submodules/hr/PaystubEditor";
import PerformanceReview from "./submodules/hr/PerformanceReview";
import RecruitmentMgmt from "./submodules/hr/RecruitmentManagement";
import TrainingManagement from "./submodules/hr/TrainingManagement";
import HRSettings from "./submodules/hr/HRSettings";
import Announcements from "./submodules/hr/Announcements";
import HRDocumentManagement from "./submodules/hr/DocumentManagement";
import EmployeeSelfService from "./submodules/hr/EmployeeSelfService";
import ShiftScheduleManagement from "./submodules/hr/ShiftScheduleManagement";

/* ---------------- Engineering (CMMS/CAFM) ---------------- */
import AssetManagement from "./submodules/Engineering/AssetManagement.jsx";
import PMScheduler from "./submodules/Engineering/PMScheduler.jsx";
import WorkOrdersManagement from "./submodules/Engineering/WorkOrdersManagement.jsx";
import InventorySparePartsManagement from "./submodules/Engineering/InventorySparePartsManagement.jsx";
import ComplianceAuditModule from "./submodules/Engineering/ComplianceAuditModule.jsx";
import EnvironmentalMonitoringIntegration from "./submodules/Engineering/EnvironmentalMonitoringIntegration.jsx";
import BreakdownManagement from "./submodules/Engineering/BreakdownManagement.jsx";

/* ---------------- Procurement ---------------- */
import VendorManagement from "./submodules/Procurement/VendorManagement.jsx";
import ProductBOM from "./submodules/Manufacturing/ProductBOM.jsx";
import InvoiceManagement from "./submodules/Finance/InvoiceManagement.jsx";
import PurchaseOrderIndex from "./submodules/Procurement/PurchaseOrderIndex.jsx";

/* ---------------- Material Inward ---------------- */
import GateEntry from "./submodules/materialinward/GateEntry.jsx";
import VehicleInspection from "./submodules/materialinward/VehicleInspection.jsx";
import MaterialInspection from "./submodules/materialinward/MaterialInspection.jsx";
import WeightCapture from "./submodules/materialinward/WeightCapture.jsx";
import GRNPosting from "./submodules/materialinward/GRNPosting.jsx";
import LabelPrinting from "./submodules/materialinward/LabelPrinting.jsx";

/* ---------------- Warehouse / Palletization ---------------- */
import Palletization from "./submodules/materialinward/Palletization.jsx";

/* ---------------- Dashboard ---------------- */
import Dashboard from "./Dashboard.jsx";

/* ---------------- Small in-file helpers ---------------- */
const AIAssistant=()=>(<div className="p-4"><AIChatPanel title="DigitizerX • AI Assistant (RAG)"/></div>);
const ComingSoon=({title="Coming soon"})=>(
  <div className="p-6">
    <Alert>
      <AlertCircle className="h-4 w-4"/>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>This module is planned but not available yet. Please check back later.</AlertDescription>
    </Alert>
  </div>
);

const componentMap={
  /* User Authorization */
  "user-management":UserManagement,
  "role-management":RoleManagement,
  "password-management":PasswordManagement,
  "superadmin-password-reset":SuperAdminPasswordReset,

  /* Masters */
  "plant-master":PlantMaster,
  "subplant-master":SubPlantMaster,
  "department-master":DepartmentMaster,
  "area-master":AreaMaster,
  "location-master":LocationMaster,
  "equipment-master":EquipmentMaster,
  "uom-master":UomMaster,
  "material-management":MaterialManagement,

  /* Document Management */
  "ai-assistant":AIAssistant,
  "ai-report":AiReport,
  "label-master":LabelMaster,
  "check-list-master":CheckListMaster,

  /* Weighing Balance */
  "weightbox-master":WeightBoxMaster,
  "standardweight-master":StandardWeightMaster,
  "weighing-modules":WeighingModules,
  "dailyverification-log":DailyVerificationLog,
  "monthlycalibration-log":MonthlyCalibrationProcess,

  /* HR */
  "hr-dashboard":HRDashboard,
  "leave-management":LeaveManagement,                 // kept routed but not shown in sidebar
  "attendance-management":AttendanceManagement,
  "employee-self-service":EmployeeSelfService,        // ✅ ensure route exists
  "shift-schedule-management":ShiftScheduleManagement,
  "payroll-management":PayrollManagement,
  "paystub-editor":PaystubEditor,
  "performance-review":PerformanceReview,
  "recruitment-management":RecruitmentMgmt,
  "training-management":TrainingManagement,
  "hr-settings":HRSettings,
  "announcements":Announcements,
  "hr-document-management":HRDocumentManagement,

  /* Engineering (CMMS/CAFM) */
  "asset-management":AssetManagement,
  "pm-scheduler":PMScheduler,
  "work-orders-management":WorkOrdersManagement,
  "inventory-spare-parts-management":InventorySparePartsManagement,
  "compliance-audit-module":ComplianceAuditModule,
  "environmental-monitoring-integration":EnvironmentalMonitoringIntegration,
  "breakdown-management":BreakdownManagement,

  /* Procurement */
  "vendor-management":VendorManagement,
  "product-bom":ProductBOM,
  "invoice-management":InvoiceManagement,
  "purchase-order":PurchaseOrderIndex,

  /* Material Inward */
  "gate-entry":GateEntry,
  "vehicle-inspection":VehicleInspection,
  "material-inspection":MaterialInspection,
  "weight-capture":WeightCapture,
  "grn-posting":GRNPosting,
  "label-printing":LabelPrinting,

  /* Palletization / Putaway */
  "palletization":Palletization,
  "putaway":Palletization,
  "put-away":Palletization,
  "material-putaway":Palletization,
  "location-mapping":Palletization,
  "warehouse-putaway":Palletization,

  /* Dashboard */
  "dashboard":Dashboard
};

const toKey=(s)=>s?s.toLowerCase().replace(/\s+/g,"-"):"";

export default function ModuleRenderer(){
  const {moduleKey,submoduleKey}=useParams();
  const location=useLocation();
  const activeKey=toKey(submoduleKey)||toKey(moduleKey);

  const MatchedComponent=useMemo(()=>componentMap[activeKey]||null,[activeKey]);
  const mode=activeKey==="paystub-editor"?"editor":"approval";

  const cacheRef=useRef(new Map());
  let element=cacheRef.current.get(activeKey);
  if(!element&&MatchedComponent){
    element=<MatchedComponent mode={mode}/>;
    cacheRef.current.set(activeKey,element);
  }

  /* -------- dev HUD toggle (persisted) -------- */
  const isDev=import.meta.env.MODE==="development";
  const initialShow=(()=>{
    try{
      const qp=new URLSearchParams(location.search);
      if(qp.has("hud")){return !["0","false","no"].includes(qp.get("hud")?.toLowerCase?.()||"");}
      return JSON.parse(localStorage.getItem("dx.hud.visible")??"true");
    }catch{return true;}
  })();
  const [showHud,setShowHud]=useState(initialShow);
  useEffect(()=>{localStorage.setItem("dx.hud.visible",JSON.stringify(showHud));},[showHud]);

  // Hotkey: Ctrl/Cmd+Shift+H toggles HUD
  useEffect(()=>{
    const onKey=(e)=>{
      const key=String(e?.key??"").toLowerCase();
      const ctrl=e?.ctrlKey||e?.metaKey;
      if(ctrl&&e?.shiftKey&&key==="h"){e.preventDefault();setShowHud((v)=>!v);}
    };
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[]);

  return(
    <div className="relative p-4">
      {element?element:(
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4"/>
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Module &quot;{activeKey}&quot; not found. Please check the URL or contact support.</AlertDescription>
        </Alert>
      )}

      {isDev&&(
        <>
          {/* floating toggle button */}
          <button
            type="button"
            onClick={()=>setShowHud((v)=>!v)}
            className="fixed bottom-2 right-2 z-50 rounded-full shadow-md border border-slate-300 bg-white/90 backdrop-blur px-2.5 py-2 hover:bg-white"
            title="Toggle Dev HUD (Ctrl/Cmd+Shift+H)"
            aria-label="Toggle Dev HUD"
          >
            {showHud?<EyeOff size={16}/>:<Eye size={16}/>}
          </button>

          {/* HUD panel */}
          {showHud&&(
            <div className="fixed bottom-12 right-2 bg-yellow-200 text-black border border-yellow-400 rounded p-2 text-xs shadow-lg z-50">
              <div><strong>Module:</strong> {moduleKey}</div>
              <div><strong>Submodule:</strong> {submoduleKey}</div>
              <div><strong>Active Key:</strong> {activeKey}</div>
              <div><strong>Mode:</strong> {mode}</div>
              <div><strong>Matched:</strong> {MatchedComponent?"✅ Found":"❌ Undefined"}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
