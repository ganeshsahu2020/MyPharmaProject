// src/components/ui/skeleton.tsx
import React from 'react';

function cn(...classes:string[]){ return classes.filter(Boolean).join(' '); }

export const Skeleton=({className}:{className?:string})=>{
  return <div className={cn('animate-pulse rounded-md bg-muted/50',className||'')}/>;
};

export default Skeleton;
