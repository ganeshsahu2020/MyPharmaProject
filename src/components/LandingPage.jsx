import React,{useState} from 'react';
import {Outlet,Link} from 'react-router-dom';
import {useAuth} from '../contexts/AuthContext';
import {Settings,Users,FileText,Package,FlaskConical,Scale,ChevronLeft,ChevronRight,Menu} from 'lucide-react';

const modules=[
  {
    name:'Masters',
    icon:<Settings size={22}/>,
    route:'masters',
    submodules:[
      'Plant Master','SubPlant Master','Department Master',
      'Area Master','Location Master','Equipment Master','Uom Master'
    ]
  },
  {
    name:'User Authorization',
    icon:<Users size={22}/>,
    route:'user-authorization',
    submodules:['User Management','Role Management','Password Management']
  },
  {
    name:'Document Management',
    icon:<FileText size={22}/>,
    route:'document-management',
    submodules:['Label Master']
  },
  {
    name:'Material Inward',
    icon:<Package size={22}/>,
    route:'material-inward',
    submodules:['Gate Entry','Vehicle Inspection','Material Inspection','Weight Capture','GRN Posting','Label Printing','Palletization']
  },
  {
    name:'Sampling',
    icon:<FlaskConical size={22}/>,
    route:'sampling',
    submodules:['Area Assignment','Sampling','Stage Out','Relocate to WH']
  },
  {
    name:'Weighing Balance',
    icon:<Scale size={22}/>,
    route:'weighing-balance',
    submodules:[
      'WeightBox Master','StandardWeight Master','Weighing Modules',
      'DailyVerification Log','MonthlyCalibration Master',
      'Step2 Checklist','Step3 WeightReadings'
    ]
  }
];

const LandingPage=()=>{
  const [activeModule,setActiveModule]=useState(null);
  const [collapsed,setCollapsed]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);

  const {session}=useAuth();
  const username=session?.user?.email?.split('@')[0]||'Admin';
  const role=session?.user?.role||'User';

  const handleLogout=async()=>{
    localStorage.clear();
    window.location.href='/login';
  };

  const toRoute=(modRoute,sub)=>(
    sub==='Weighing Modules' ? '/weighing-balance/weighing-modules' :
    sub==='DailyVerification Log' ? '/weighing-balance/dailyverification-log' :
    sub==='MonthlyCalibration Master' ? '/weighing-balance/monthlycalibration-master' :
    sub==='Step2 Checklist' ? '/weighing-balance/step2-checklist' :
    sub==='Step3 WeightReadings' ? '/weighing-balance/step3-weightreadings' :
    `/${modRoute}/${sub.toLowerCase().replace(/\s+/g,'-')}`
  );

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside
        className={`bg-blue-900 text-white flex flex-col fixed md:relative z-40 h-full transition-transform duration-300 ease-in-out ${mobileOpen?'translate-x-0':'-translate-x-full md:translate-x-0'}`}
        style={{width:collapsed?'5rem':'16rem'}}
      >
        <div className="flex items-center justify-between p-4 border-b border-blue-800">
          {!collapsed&&<h2 className="font-bold text-lg">Modules</h2>}
          <button onClick={()=>setMobileOpen(false)} className="md:hidden text-white" aria-label="Close menu">✕</button>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto">
          {modules.map((mod,index)=>(
            <div key={index} className="mb-2 relative">
              <button
                type="button"
                onClick={()=>setActiveModule(activeModule===index?null:index)}
                className={`flex items-center w-full px-3 py-2 rounded-lg transition relative group ${activeModule===index?'bg-blue-800':''}`}
              >
                <div className="flex items-center justify-center w-6">{mod.icon}</div>
                {!collapsed&&<span className="ml-3 text-sm">{mod.name}</span>}
                {collapsed&&(
                  <span className="absolute left-16 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-50 pointer-events-none">
                    {mod.name}
                  </span>
                )}
              </button>

              {activeModule===index&&(
                <div className="pl-8 mt-1 space-y-1">
                  {mod.submodules.map((sub,idx)=>(
                    <div key={idx} className="relative group">
                      <Link
                        to={toRoute(mod.route,sub)}
                        className="block px-2 py-1 text-xs rounded hover:bg-blue-700 transition text-white"
                        onClick={()=>setMobileOpen(false)}
                      >
                        {collapsed?mod.icon:sub}
                      </Link>
                      {collapsed&&(
                        <span className="absolute left-16 top-1/2 -translate-y-1/2 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-50 pointer-events-none">
                          {sub}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-blue-800 flex justify-center">
          <button
            onClick={()=>setCollapsed(!collapsed)}
            className="p-2 bg-blue-800 hover:bg-blue-700 rounded-full transition"
            aria-label="Toggle sidebar"
          >
            {collapsed?<ChevronRight size={18}/>:<ChevronLeft size={18}/>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        <header className="flex items-center justify-between bg-white shadow px-4 md:px-6 py-3">
          <button onClick={()=>setMobileOpen(true)} className="md:hidden" aria-label="Open menu">
            <Menu size={24}/>
          </button>
          <div className="flex-1 flex justify-center md:justify-center">
            <h1 className="text-2xl font-bold text-blue-700">DigitizerX</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <p className="text-sm font-semibold text-gray-700">{username}</p>
              <p className="text-xs text-gray-500">{role}</p>
            </div>
            <div className="w-8 h-8 bg-blue-500 text-white flex items-center justify-center rounded-full font-bold">
              {username?.[0]?.toUpperCase()||'A'}
            </div>
            <button onClick={handleLogout} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded">
              Logout
            </button>
          </div>
        </header>

        {/* IMPORTANT: keep Outlet mounted and unkeyed */}
        <main className="flex-1 bg-gray-50 overflow-auto">
          <div className="w-full px-4 md:px-8 py-6">
            <div className="bg-white rounded-xl shadow p-6 max-w-6xl mx-auto">
              <Outlet/>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default React.memo(LandingPage);
