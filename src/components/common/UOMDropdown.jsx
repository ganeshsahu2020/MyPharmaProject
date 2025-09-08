// src/components/common/UOMDropdown.jsx
import React,{useMemo} from 'react';
import {useUOM} from '../../contexts/UOMContext';

const UOMDropdown=({value,onChange,className,id,name,placeholder='Select UOM',disabled=false,autoFocus=false})=>{
  const {uoms,loading,error}=useUOM();
  const cls=className||'border p-2 rounded w-full text-sm';
  const options=useMemo(()=>Array.isArray(uoms)?uoms:[],[uoms]);

  if(loading){
    return(
      <select id={id} name={name} className={cls} disabled aria-busy="true">
        <option>Loading UOMs…</option>
      </select>
    );
  }

  if(error){
    return(
      <select id={id} name={name} className={cls} disabled aria-invalid="true" title="Failed to load UOMs">
        <option>Failed to load UOMs</option>
      </select>
    );
  }

  const handleChange=(e)=>onChange?.(e.target.value);

  return(
    <select
      id={id}
      name={name}
      value={value||''}
      onChange={handleChange}
      className={cls}
      disabled={disabled||options.length===0}
      autoFocus={autoFocus}
    >
      <option value="">{placeholder}</option>
      {options.map((u)=>(
        <option key={u.id||u.uom_code} value={u.uom_code}>
          {u.uom_code} — {u.uom_name}
        </option>
      ))}
    </select>
  );
};

export default UOMDropdown;
