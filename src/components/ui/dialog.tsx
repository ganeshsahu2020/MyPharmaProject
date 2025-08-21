// src/components/ui/dialog.tsx
import * as React from 'react';

export const Dialog=({open,onOpenChange,children}:{open:boolean;onOpenChange:(v:boolean)=>void;children:React.ReactNode;})=>{
  React.useEffect(()=>{
    const onEsc=(e:KeyboardEvent)=>{ if(e.key==='Escape'){ onOpenChange(false); } };
    if(open){ document.addEventListener('keydown',onEsc); }
    return ()=>document.removeEventListener('keydown',onEsc);
  },[open,onOpenChange]);
  if(!open){ return null; }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={()=>onOpenChange(false)}/>
      {children}
    </div>
  );
};

export const DialogContent=({children,className}:{children:React.ReactNode;className?:string})=>(
  <div className={`relative z-50 w-[95%] max-w-lg rounded-xl bg-white p-4 shadow-xl ${className||''}`}>{children}</div>
);

export const DialogHeader=({children}:{children:React.ReactNode})=>(
  <div className="mb-2">{children}</div>
);

export const DialogTitle=({children,className}:{children:React.ReactNode;className?:string})=>(
  <h3 className={`text-lg font-semibold ${className||''}`}>{children}</h3>
);

export const DialogFooter=({children,className}:{children:React.ReactNode;className?:string})=>(
  <div className={`mt-4 flex justify-end gap-2 ${className||''}`}>{children}</div>
);
