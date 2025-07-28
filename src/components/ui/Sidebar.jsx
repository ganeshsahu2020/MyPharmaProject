import { useState } from 'react';
import { Home, Users, Settings } from 'lucide-react';

const Sidebar = () => {
  const [active, setActive] = useState('Dashboard');

  const menu = [
    {name:'Dashboard', icon:<Home size={20}/>},
    {name:'User Management', icon:<Users size={20}/>},
    {name:'Settings', icon:<Settings size={20}/>},
  ];

  return (
    <aside className="w-64 bg-white shadow-lg flex flex-col">
      <div className="p-4 text-xl font-bold text-blue-600">DigitizerX</div>
      <nav className="flex-1">
        {menu.map((item)=>(
          <button 
            key={item.name} 
            className={`flex items-center w-full px-4 py-2 text-left hover:bg-blue-50 ${
              active===item.name ? 'bg-blue-100 text-blue-700' : 'text-gray-700'
            }`}
            onClick={()=>setActive(item.name)}
          >
            {item.icon}
            <span className="ml-3">{item.name}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
