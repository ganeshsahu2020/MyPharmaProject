import React,{useMemo,useRef} from 'react';
import {useParams} from 'react-router-dom';

// 🔹 User Authorization
import UserManagement from './submodules/UserAuthorization/UserManagement';
import RoleManagement from './submodules/UserAuthorization/RoleManagement';
import PasswordManagement from './submodules/UserAuthorization/PasswordManagement';
import SuperAdminPasswordReset from './submodules/UserAuthorization/SuperAdminPasswordReset';

// 🔹 Masters
import PlantMaster from './submodules/masters/PlantMaster';
import SubPlantMaster from './submodules/masters/SubPlantMaster';
import DepartmentMaster from './submodules/masters/DepartmentMaster';
import AreaMaster from './submodules/masters/AreaMaster';
import LocationMaster from './submodules/masters/LocationMaster';
import EquipmentMaster from './submodules/masters/EquipmentMaster';
import UomMaster from './submodules/masters/UomMaster';

// 🔹 Document Management
import LabelMaster from './submodules/DocumentManagement/LabelMaster';

// 🔹 Weighing Balance
import WeightBoxMaster from './submodules/WeighingBalance/WeightBoxMaster';
import StandardWeightMaster from './submodules/WeighingBalance/StandardWeightMaster';
import WeighingModules from './submodules/WeighingBalance/WeighingModules';
import DailyVerificationLog from './submodules/WeighingBalance/DailyVerificationLog';
import MonthlyCalibrationMaster from './submodules/WeighingBalance/MonthlyCalibrationMaster';

// ⛳️ IMPORTANT: match your actual file name!
// If your file is "Step2Checklist.jsx" (no underscore), keep this line:
import Step2Checklist from './submodules/weighingbalance/Step2_Checklist';
// If your file is "Step2_Checklist.jsx" (with underscore), use this instead:
// import Step2Checklist from './submodules/WeighingBalance/Step2_Checklist';

import Step3WeightReadings from './submodules/WeighingBalance/Step3_WeightReadings';

const componentMap={
  'user-management':UserManagement,
  'role-management':RoleManagement,
  'password-management':PasswordManagement,
  'superadmin-password-reset':SuperAdminPasswordReset,
  'plant-master':PlantMaster,
  'subplant-master':SubPlantMaster,
  'department-master':DepartmentMaster,
  'area-master':AreaMaster,
  'location-master':LocationMaster,
  'equipment-master':EquipmentMaster,
  'uom-master':UomMaster,
  'label-master':LabelMaster,
  'weightbox-master':WeightBoxMaster,
  'standardweight-master':StandardWeightMaster,
  'weighing-modules':WeighingModules,
  'dailyverification-log':DailyVerificationLog,
  'monthlycalibration-master':MonthlyCalibrationMaster,
  'step2-checklist':Step2Checklist,
  'step3-weightreadings':Step3WeightReadings
};

const toKey=(s)=>s?.toLowerCase().replace(/\s+/g,'-')||'';

const ModuleRenderer=()=>{
  const {moduleKey,submoduleKey}=useParams();
  const activeKey=toKey(submoduleKey)||toKey(moduleKey);

  const MatchedComponent=useMemo(()=>componentMap[activeKey]||null,[activeKey]);

  // cache mounted instances so inputs don't reset on re-renders
  const cacheRef=useRef(new Map());
  let element=cacheRef.current.get(activeKey);
  if(!element&&MatchedComponent){
    element=<MatchedComponent/>;
    cacheRef.current.set(activeKey,element);
  }

  return (
    <div className="relative p-4">
      {element?element:(
        <div className="animate-pulse p-6 bg-gray-100 rounded-md">
          <div className="h-6 bg-gray-300 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-300 rounded w-2/3 mb-2"></div>
          <div className="h-4 bg-gray-300 rounded w-1/2"></div>
        </div>
      )}

      {import.meta.env.MODE==='development'&&(
        <div className="fixed bottom-2 right-2 bg-yellow-200 border border-yellow-400 rounded p-2 text-xs shadow-lg z-50">
          <div><strong>Module:</strong> {moduleKey}</div>
          <div><strong>Submodule:</strong> {submoduleKey}</div>
          <div><strong>Active Key:</strong> {activeKey}</div>
          <div><strong>Matched:</strong> {MatchedComponent?'✅ Found':'❌ Undefined'}</div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ModuleRenderer);
