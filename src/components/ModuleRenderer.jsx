import React,{useMemo,useRef} from 'react';
import {useParams} from 'react-router-dom';
import {Alert,AlertDescription,AlertTitle} from './ui/alert';
import {AlertCircle} from 'lucide-react';

/* ---------------- User Authorization ---------------- */
import UserManagement from './submodules/UserAuthorization/UserManagement';
import RoleManagement from './submodules/UserAuthorization/RoleManagement';
import PasswordManagement from './submodules/UserAuthorization/PasswordManagement';
import SuperAdminPasswordReset from './submodules/UserAuthorization/SuperAdminPasswordReset';

/* ---------------- Masters ---------------- */
import PlantMaster from './submodules/masters/PlantMaster';
import SubPlantMaster from './submodules/masters/SubPlantMaster';
import DepartmentMaster from './submodules/masters/DepartmentMaster';
import AreaMaster from './submodules/masters/AreaMaster';
import LocationMaster from './submodules/masters/LocationMaster';
import EquipmentMaster from './submodules/masters/EquipmentMaster';
import UomMaster from './submodules/masters/UomMaster';

/* ---------------- Document Management ---------------- */
import LabelMaster from './submodules/DocumentManagement/LabelMaster';
import CheckListMaster from './submodules/DocumentManagement/CheckListMaster.jsx';

/* ---------------- Weighing Balance ---------------- */
import WeightBoxMaster from './submodules/weighingbalance/WeightBoxMaster.jsx';
import StandardWeightMaster from './submodules/weighingbalance/StandardWeightMaster.jsx';
import WeighingModules from './submodules/weighingbalance/WeighingModules.jsx';
import DailyVerificationLog from './submodules/weighingbalance/DailyVerificationLog.jsx';
import MonthlyCalibrationProcess from './submodules/weighingbalance/monthlycalibrationlog/MonthlyCalibrationProcess.jsx';

/* ---------------- HR ---------------- */
import HRDashboard from './submodules/hr/HRDashboard';
import LeaveManagement from './submodules/hr/LeaveManagement';
import AttendanceManagement from './submodules/hr/AttendanceManagement';
import PayrollManagement from './submodules/hr/PayrollManagement';
import PaystubEditor from './submodules/hr/PaystubEditor';
import PerformanceReview from './submodules/hr/PerformanceReview';
import RecruitmentMgmt from './submodules/hr/RecruitmentManagement';
import TrainingManagement from './submodules/hr/TrainingManagement';
import HRSettings from './submodules/hr/HRSettings';
import Announcements from './submodules/hr/Announcements';
import HRDocumentManagement from './submodules/hr/DocumentManagement';
import EmployeeSelfService from './submodules/hr/EmployeeSelfService';
import ShiftScheduleManagement from './submodules/hr/ShiftScheduleManagement';

/* ---------------- Engineering (CMMS/CAFM) ---------------- */
import AssetManagement from './submodules/Engineering/AssetManagement.jsx';
import PMScheduler from './submodules/Engineering/PMScheduler.jsx';
import WorkOrdersManagement from './submodules/Engineering/WorkOrdersManagement.jsx';
import InventorySparePartsManagement from './submodules/Engineering/InventorySparePartsManagement.jsx';
import ComplianceAuditModule from './submodules/Engineering/ComplianceAuditModule.jsx';
import EnvironmentalMonitoringIntegration from './submodules/Engineering/EnvironmentalMonitoringIntegration.jsx';
import BreakdownManagement from './submodules/Engineering/BreakdownManagement.jsx';

const componentMap = {
  /* User Authorization */
  'user-management': UserManagement,
  'role-management': RoleManagement,
  'password-management': PasswordManagement,
  'superadmin-password-reset': SuperAdminPasswordReset,

  /* Masters */
  'plant-master': PlantMaster,
  'subplant-master': SubPlantMaster,
  'department-master': DepartmentMaster,
  'area-master': AreaMaster,
  'location-master': LocationMaster,
  'equipment-master': EquipmentMaster,
  'uom-master': UomMaster,

  /* Document Management */
  'label-master': LabelMaster,
  'check-list-master': CheckListMaster,

  /* Weighing Balance */
  'weightbox-master': WeightBoxMaster,
  'standardweight-master': StandardWeightMaster,
  'weighing-modules': WeighingModules,
  'dailyverification-log': DailyVerificationLog,
  'monthlycalibration-log': MonthlyCalibrationProcess,

  /* HR */
  'hr-dashboard': HRDashboard,
  'leave-management': LeaveManagement,
  'attendance-management': AttendanceManagement,
  'shift-schedule-management': ShiftScheduleManagement,
  'payroll-management': PayrollManagement,
  'paystub-editor': PaystubEditor,
  'performance-review': PerformanceReview,
  'recruitment-management': RecruitmentMgmt,
  'training-management': TrainingManagement,
  'hr-settings': HRSettings,
  'announcements': Announcements,
  'hr-document-management': HRDocumentManagement,
  'employee-self-service': EmployeeSelfService,

  /* Engineering (CMMS/CAFM) */
  'asset-management': AssetManagement,
  'pm-scheduler': PMScheduler,
  'work-orders-management': WorkOrdersManagement,
  'inventory-spare-parts-management': InventorySparePartsManagement,
  'compliance-audit-module': ComplianceAuditModule,
  'environmental-monitoring-integration': EnvironmentalMonitoringIntegration,
  'breakdown-management': BreakdownManagement
};

const toKey = (s) => (s ? s.toLowerCase().replace(/\s+/g, '-') : '');
const ModuleRenderer = () => {
  const { moduleKey, submoduleKey } = useParams();
  const activeKey = toKey(submoduleKey) || toKey(moduleKey);
  const MatchedComponent = useMemo(() => componentMap[activeKey] || null, [activeKey]);

  const mode = activeKey === 'paystub-editor' ? 'editor' : 'approval';

  const cacheRef = useRef(new Map());
  let element = cacheRef.current.get(activeKey);
  if (!element && MatchedComponent) {
    element = <MatchedComponent mode={mode} />;
    cacheRef.current.set(activeKey, element);
  }

  return (
    <div className="relative p-4">
      {element ? (
        element
      ) : (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Module &quot;{activeKey}&quot; not found. Please check the URL or contact support.
          </AlertDescription>
        </Alert>
      )}
      {import.meta.env.MODE === 'development' && (
        <div className="fixed bottom-2 right-2 bg-yellow-200 text-black border border-yellow-400 rounded p-2 text-xs shadow-lg z-50">
          <div><strong>Module:</strong> {moduleKey}</div>
          <div><strong>Submodule:</strong> {submoduleKey}</div>
          <div><strong>Active Key:</strong> {activeKey}</div>
          <div><strong>Mode:</strong> {mode}</div>
          <div><strong>Matched:</strong> {MatchedComponent ? '✅ Found' : '❌ Undefined'}</div>
        </div>
      )}
    </div>
  );
};

export default ModuleRenderer;