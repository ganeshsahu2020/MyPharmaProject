import {useUOM} from '../../contexts/UOMContext';

const UOMDropdown=({value,onChange,className})=>{
  const {uoms,loading,error}=useUOM();

  if(loading) return <select className={className||"border p-2"} disabled><option>Loading UOMs...</option></select>;
  if(error) return <select className={className||"border p-2"} disabled><option>Error loading UOMs</option></select>;

  return (
    <select value={value} onChange={(e)=>onChange(e.target.value)} className={className||"border p-2"}>
      <option value="">Select UOM</option>
      {uoms.map((uom)=>(
        <option key={uom.id} value={uom.uom_code}>
          {uom.uom_code} - {uom.uom_name}
        </option>
      ))}
    </select>
  );
};

export default UOMDropdown;
