import {createContext,useContext,useEffect,useState} from 'react';
import {supabase} from '../utils/supabaseClient';
import toast from 'react-hot-toast';

const UOMContext=createContext();

export const UOMProvider=({children})=>{
  const [uoms,setUoms]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);

  useEffect(()=>{
    const fetchUOMs=async()=>{
      try{
        const {data,error}=await supabase
          .from('uom_master')
          .select('id,uom_code,uom_name')
          .eq('status','Active')
          .order('uom_code');

        if(error) throw error;
        setUoms(data||[]);
      }catch(err){
        console.error('❌ UOM Fetch Error:',err.message);
        setError(err.message);
        toast.error('Failed to load UOMs');
      }finally{
        setLoading(false);
      }
    };
    fetchUOMs();
  },[]);

  return (
    <UOMContext.Provider value={{uoms,loading,error}}>
      {children}
    </UOMContext.Provider>
  );
};

export const useUOM=()=>useContext(UOMContext);
