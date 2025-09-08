// src/api/locationApi.js
import {supabase} from '../utils/supabaseClient';

/** Fetch a page of locations for pickers/dropdowns */
export const loadLocations=async(limit=50)=>{
  const {data,error}=await supabase
    .from('vw_location_master_ui')
    .select('location_uid,location_code,location_name,plant_id,subplant_id,department_id,area_id,location_status')
    .order('location_code',{ascending:true})
    .limit(limit);
  if(error){throw error;}
  return data||[];
};

/** Fetch a single location by its code (e.g., "RM-001-A001") */
export const getLocationByCode=async(code)=>{
  const {data,error}=await supabase
    .from('vw_location_master_ui')
    .select('location_uid,location_code,location_name,plant_id,subplant_id,department_id,area_id,location_status')
    .eq('location_code',code)
    .maybeSingle();
  if(error){throw error;}
  return data; // null if not found
};

/** Search by code or name (lightweight ilike) */
export const searchLocations=async(q,limit=20)=>{
  const term=String(q||'').trim();
  if(!term){return [];}
  const {data,error}=await supabase
    .from('vw_location_master_ui')
    .select('location_uid,location_code,location_name')
    .or(`location_code.ilike.%${term}%,location_name.ilike.%${term}%`)
    .order('location_code',{ascending:true})
    .limit(limit);
  if(error){throw error;}
  return data||[];
};

/** Bulk fetch by codes (for mapping/moves) */
export const getLocationsByCodes=async(codes=[])=>{
  const list=Array.isArray(codes)?codes.filter(Boolean):[];
  if(!list.length){return [];}
  const {data,error}=await supabase
    .from('vw_location_master_ui')
    .select('location_uid,location_code,location_name')
    .in('location_code',list);
  if(error){throw error;}
  return data||[];
};
