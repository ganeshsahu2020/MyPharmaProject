import { supabase } from '../utils/supabaseClient';

export const loadMasters = async () => {
  const [pl, sp, dp, emps] = await Promise.all([
    supabase
      .from('plant_master')
      .select('id,plant_id,description')
      .order('plant_id', { ascending: true }),
    supabase
      .from('subplant_master')
      .select('id,subplant_id,subplant_name,plant_uid')
      .order('subplant_id', { ascending: true }),
    supabase
      .from('department_master')
      .select('id,department_id,department_name,subplant_uid')
      .order('department_id', { ascending: true }),
    supabase
      .from('vw_user_management_ext')
      .select(
        'id,employee_id,first_name,last_name,plant_uid,subplant_uid,department_uid,status'
      )
      .eq('status', 'Active')
      .order('employee_id', { ascending: true }),
  ]);

  return {
    plants: pl.data || [],
    subplants: sp.data || [],
    departments: dp.data || [],
    employees: (emps.data || []).map((e) => ({
      ...e,
      label: `${e.employee_id} - ${e.first_name} ${e.last_name}`,
    })),
  };
};

export const cascade = {
  subplants: (all, plant) => all.filter((s) => !plant || s.plant_uid === plant),
  departments: (all, subplant) =>
    all.filter((d) => !subplant || d.subplant_uid === subplant),
  employees: (all, { plant, subplant, department }) => {
    let list = all;
    if (department) list = list.filter((e) => e.department_uid === department);
    else if (subplant) list = list.filter((e) => e.subplant_uid === subplant);
    else if (plant) list = list.filter((e) => e.plant_uid === plant);
    return list;
  },
};
