import React,{useState} from 'react';
import {Outlet,Link,useNavigate} from 'react-router-dom';
import {useAuth} from '../contexts/AuthContext';
import {
  Settings,Users,FileText,Package,FlaskConical,Scale,
  ChevronLeft,ChevronRight,Menu,UserCheck
} from 'lucide-react';
import {Button} from './ui/button';
import {Card} from './ui/card';
import logo from '../assets/logo.png';

/** Sidebar module + submodule listing */
const modules=[
  {
    name:'Masters',
    icon:<Settings size={22}/>,
    route:'masters',
    submodules:[
      'Plant Master',
      'SubPlant Master',
      'Department Master',
      'Area Master',
      'Location Master',
      'Equipment Master',
      'Uom Master'
    ]
  },
  {
    name:'User Authorization',
    icon:<Users size={22}/>,
    route:'user-authorization',
    submodules:['User Management','Role Management','Password Management']
  },
  {
    name:'HR',
    icon:<UserCheck size={22}/>,
    route:'hr',
    submodules:[
      'HR Dashboard',
      'Leave Management',
      'Attendance Management',       // ✅ distinct
      'Shift Schedule Management',   // ✅ distinct
      'Payroll Management',
      'Paystub Editor',
      'Performance Review',
      'Recruitment Management',
      'Training Management',
      'Employee Self-Service',
      'HR Reports',
      'HR Settings',
      'Announcements',
      'Document Management'
    ]
  },
  {
    name:'Document Management',
    icon:<FileText size={22}/>,
    route:'document-management',
    submodules:['Label Master','Check List Master']
  },
  {
    name:'Material Inward',
    icon:<Package size={22}/>,
    route:'material-inward',
    submodules:[
      'Gate Entry',
      'Vehicle Inspection',
      'Material Inspection',
      'Weight Capture',
      'GRN Posting',
      'Label Printing',
      'Palletization'
    ]
  },
  {
    name:'Weighing Balance',
    icon:<Scale size={22}/>,
    route:'weighing-balance',
    submodules:[
      'WeightBox Master',
      'StandardWeight Master',
      'Weighing Modules',
      'DailyVerification Log',
      'MonthlyCalibration Log'
    ]
  }
];

// Label → slug (matches ModuleRenderer keys)
const slug=(s)=>s.toLowerCase().replace(/\s+/g,'-');

const LandingPage=()=>{
  const [activeModule,setActiveModule]=useState(null);
  const [collapsed,setCollapsed]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const {session,logout}=useAuth();
  const navigate=useNavigate();
  const username=session?.user?.email?.split('@')[0]||'Admin';

  const handleLogout=async()=>{
    await logout();
    navigate('/login');
  };

  /** Central route builder:
   *  - HR "Document Management" → /hr/hr-document-management (ModuleRenderer key)
   *  - Weighing Modules and logs → normalized routes
   *  - Everything else → /{moduleRoute}/{slug(submodule)}
   */
  const toRoute=(modRoute,sub)=>
    sub==='Weighing Modules'
      ? '/weighing-balance/weighing-modules'
      : sub==='DailyVerification Log'
      ? '/weighing-balance/dailyverification-log'
      : sub==='MonthlyCalibration Log'
      ? '/weighing-balance/monthlycalibration-log'
      : modRoute==='hr'&&sub==='Document Management'
      ? '/hr/hr-document-management'
      : `/${modRoute}/${slug(sub)}`;

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <aside
        className={`bg-blue-800 text-white flex flex-col min-w-[16rem] fixed md:relative z-40 h-full transition-transform duration-300 ease-in-out ${mobileOpen?'translate-x-0':'-translate-x-full md:translate-x-0'}`}
        style={{width:collapsed?'5rem':'16rem'}}
      >
        <div className="flex items-center justify-center p-4 border-b border-white/10">
          {!collapsed&&<h2 className="font-bold text-lg">Modules</h2>}
        </div>

        <nav className="flex-1 p-3 overflow-y-auto">
          {modules.map((mod,index)=>(
            <div key={mod.name} className="mb-2">
              <Button
                variant="ghost"
                className={`flex items-center w-full px-3 py-2 rounded-lg transition ${activeModule===index?'bg-white/20':''}`}
                onClick={()=>setActiveModule(activeModule===index?null:index)}
              >
                <div className="w-10 flex items-center justify-center">
                  {mod.icon}
                </div>
                {!collapsed&&(
                  <span className="ml-2 text-sm text-white flex-1 text-left">
                    {mod.name}
                  </span>
                )}
              </Button>

              {activeModule===index&&(
                <div className="pl-12 mt-1 space-y-1">
                  {mod.submodules.map((sub)=>(
                    <div key={`${mod.route}-${sub}`}>
                      <Link
                        to={toRoute(mod.route,sub)}
                        className="block px-2 py-1 text-xs rounded hover:bg-white/10 transition text-white text-left"
                        onClick={()=>setMobileOpen(false)}
                      >
                        {sub}
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10 flex justify-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={()=>setCollapsed(!collapsed)}
            className="bg-white/20 hover:bg-white/30 rounded-full transition"
            aria-label="Toggle sidebar"
          >
            {collapsed?<ChevronRight size={18}/>:<ChevronLeft size={18}/>}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col ml-[16rem] md:ml-0">
        <header className="flex items-center justify-between bg-gray-100 shadow px-4 md:px-6 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={()=>setMobileOpen(true)}
            className="md:hidden"
            aria-label="Open menu"
          >
            <Menu size={24}/>
          </Button>

          <div className="flex-1 flex justify-center">
            <div className="flex items-center gap-4">
              <img src={logo} alt="Logo" className="w-16 h-auto"/>
              <h1 className="text-2xl font-bold text-blue-700">DigitizerX</h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <p className="text-sm font-semibold text-gray-700">{username}</p>
              <p className="text-xs text-gray-500">User</p>
            </div>
            <div className="w-8 h-8 bg-blue-700 text-white flex items-center justify-center rounded-full font-bold">
              {username?.[0]?.toUpperCase()||'A'}
            </div>
            <Button variant="destructive" onClick={handleLogout} className="px-3 py-1">
              Logout
            </Button>
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
};

export default LandingPage;
