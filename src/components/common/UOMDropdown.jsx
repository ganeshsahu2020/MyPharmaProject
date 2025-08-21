// src/components/common/UOMDropdown.jsx
import React from 'react';
import {useUOM} from '../../contexts/UOMContext';

const UOMDropdown=({value,onChange,className})=>{
  const {uoms,loading,error}=useUOM();
  const cls=className||'border p-2 rounded w-full';

  if(loading){ return <select className={cls} disabled><option>Loading UOMs…</option></select>; }
  if(error){ return <select className={cls} disabled><option>Failed to load UOMs</option></select>; }

  return (
    <select value={value||''} onChange={(e)=>onChange(e.target.value)} className={cls}>
      <option value=''>Select UOM</option>
      {uoms.map((u)=>(
        <option key={u.id} value={u.uom_code}>
          {u.uom_code} — {u.uom_name}
        </option>
      ))}
    </select>
  );
};

export default UOMDropdown;
