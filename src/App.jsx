import {Routes,Route,Navigate} from 'react-router-dom';
import {AuthProvider} from './contexts/AuthContext';
import {UOMProvider} from './contexts/UOMContext';
import {Toaster} from 'react-hot-toast';

// Core Components
import Login from './components/Login';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import AuthGuard from './components/AuthGuard';
import UpdatePassword from './components/UpdatePassword';

// Dynamic module renderer (handles all submodules)
import ModuleRenderer from './components/ModuleRenderer';

const App=()=>{
  return (
    <UOMProvider>
      <AuthProvider>
        <Toaster
          position="top-right"
          reverseOrder={false}
          toastOptions={{
            duration:3000,
            style:{background:'#1e293b',color:'#fff',fontSize:'14px',borderRadius:'8px',padding:'10px 14px'},
            success:{icon:'✅',style:{background:'#15803d',color:'#fff'}},
            error:{icon:'❌',style:{background:'#b91c1c',color:'#fff'}},
            loading:{icon:'⏳',style:{background:'#0ea5e9',color:'#fff'}}
          }}
        />

        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login/>}/>
          <Route path="/update-password" element={<UpdatePassword/>}/>

          {/* Protected */}
          <Route path="/" element={<AuthGuard><LandingPage/></AuthGuard>}>
            <Route index element={<Dashboard/>}/>
            {/* Dynamic routes: /:moduleKey and /:moduleKey/:submoduleKey */}
            <Route path=":moduleKey" element={<ModuleRenderer/>}/>
            <Route path=":moduleKey/:submoduleKey" element={<ModuleRenderer/>}/>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>
      </AuthProvider>
    </UOMProvider>
  );
};

export default App;
