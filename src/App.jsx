import {Routes,Route,Navigate} from 'react-router-dom';
import {AuthProvider} from './contexts/AuthContext';

// ✅ Core Components
import Login from './components/Login';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import AuthGuard from './components/AuthGuard';

// ✅ Masters
import PlantMaster from './components/submodules/masters/PlantMaster';
import SubPlantManagement from './components/submodules/masters/SubPlantManagement';
import DepartmentMaster from './components/submodules/masters/DepartmentMaster';
import AreaMaster from './components/submodules/masters/AreaMaster';
import LocationMaster from './components/submodules/masters/LocationMaster';
import EquipmentMaster from './components/submodules/masters/EquipmentMaster';
import UomMaster from './components/submodules/masters/UomMaster'; // ✅ Added UOM Master

// ✅ User Authorization
import UserManagement from './components/submodules/UserAuthorization/UserManagement';
import RoleManagement from './components/submodules/UserAuthorization/RoleManagement';
import PasswordManagement from './components/submodules/UserAuthorization/PasswordManagement';

const App = () => {
  console.log('✅ App.jsx Loaded');

  return (
    <AuthProvider>
      <Routes>
        {/* 🔓 Public Routes */}
        <Route path="/login" element={<Login />} />

        {/* 🔒 Protected Routes */}
        <Route 
          path="/" 
          element={
            <AuthGuard>
              <LandingPage />
            </AuthGuard>
          }
        >
          {/* Default Dashboard */}
          <Route index element={<Dashboard />} />

          {/* Masters */}
          <Route path="masters/plant-master" element={<PlantMaster />} />
          <Route path="masters/subplant" element={<SubPlantManagement />} />
          <Route path="masters/department-master" element={<DepartmentMaster />} />
          <Route path="masters/area-master" element={<AreaMaster />} />
          <Route path="masters/location-master" element={<LocationMaster />} />
          <Route path="masters/equipment-master" element={<EquipmentMaster />} />
          <Route path="masters/uom-master" element={<UomMaster />} /> {/* ✅ UOM route */}

          {/* User Authorization */}
          <Route path="user-authorization/user-management" element={<UserManagement />} />
          <Route path="user-authorization/role-management" element={<RoleManagement />} />
          <Route path="user-authorization/password-management" element={<PasswordManagement />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </AuthProvider>
  );
};

export default App;
