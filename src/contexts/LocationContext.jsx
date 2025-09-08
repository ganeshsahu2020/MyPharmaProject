// src/contexts/LocationContext.jsx
import React,{createContext,useContext,useEffect,useMemo,useState} from 'react';
import {supabase} from '../utils/supabaseClient';

const LocationCtx=createContext({list:[],byCode:new Map(),loading:false,reload:()=>{}});

const loadLocations=async(limit=500)=>{
  const {data,error}=await supabase
    .from('vw_location_master_ui')
    .select('location_uid,location_code,location_name,plant_id,subplant_id,department_id,area_id,location_status')
    .order('location_code',{ascending:true})
    .limit(limit);
  if(error){throw error;}
  return data||[];
};

export const LocationProvider=({children})=>{
  const [list,setList]=useState([]);
  const [loading,setLoading]=useState(false);

  const reload=async()=>{
    setLoading(true);
    try{
      const rows=await loadLocations(500);
      setList(rows);
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{ reload(); },[]);

  const byCode=useMemo(()=>{
    const m=new Map();
    for(const r of list){ m.set(r.location_code,r); }
    return m;
  },[list]);

  return(
    <LocationCtx.Provider value={{list,byCode,loading,reload}}>
      {children}
    </LocationCtx.Provider>
  );
};

export const useLocations=()=>useContext(LocationCtx);
