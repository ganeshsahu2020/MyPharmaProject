import React from 'react';
import {useParams} from 'react-router-dom';

// 🔹 Import submodules
import UserManagement from './submodules/UserManagement';
import RoleManagement from './submodules/RoleManagement';
import PasswordManagement from './submodules/PasswordManagement';
import PlantMaster from './submodules/PlantMaster';
import SubPlantManagement from './submodules/SubPlantManagement';
import DepartmentMaster from './submodules/DepartmentMaster';
import AreaMaster from './submodules/AreaMaster';
import LocationMaster from './submodules/LocationMaster';
import EquipmentMaster from './submodules/EquipmentMaster';
import UomMaster from './submodules/UomMaster'; // ✅ Added UOM Master

// ✅ Component Map (Keys match `submoduleKey` routes)
const componentMap = {
  'user-management': UserManagement,
  'role-management': RoleManagement,
  'password-management': PasswordManagement,
  'plant-master': PlantMaster,
  'subplant': SubPlantManagement,
  'department-master': DepartmentMaster,
  'area-master': AreaMaster,
  'location-master': LocationMaster,
  'equipment-master': EquipmentMaster,
  'uom-master': UomMaster, // ✅ UOM Master mapping
  // ... include other submodules here
};

const ModuleRenderer = () => {
  const {moduleKey,submoduleKey} = useParams();
  const normalized = submoduleKey?.toLowerCase();
  const MatchedComponent = componentMap[normalized];

  return (
    <div className="relative p-4">
      {/* ✅ Render matched submodule */}
      {MatchedComponent ? (
        <MatchedComponent />
      ) : (
        <div className="animate-pulse p-6 bg-gray-100 rounded-md">
          <div className="h-6 bg-gray-300 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-300 rounded w-2/3 mb-2"></div>
          <div className="h-4 bg-gray-300 rounded w-1/2"></div>
        </div>
      )}

      {/* 🟡 Debug Panel */}
      <div className="fixed bottom-2 right-2 bg-yellow-200 border border-yellow-400 rounded p-2 text-xs shadow-lg z-50">
        <div><strong>Module:</strong> {moduleKey}</div>
        <div><strong>Submodule:</strong> {submoduleKey}</div>
        <div><strong>Normalized Key:</strong> {normalized}</div>
        <div><strong>Matched:</strong> {MatchedComponent ? '✅ Found' : '❌ Undefined'}</div>
      </div>
    </div>
  );
};

export default ModuleRenderer;
