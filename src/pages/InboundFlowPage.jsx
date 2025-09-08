// src/pages/InboundFlowPage.jsx
import React,{useState} from "react";
import InboundPOFlow from "../components/InboundPOFlow";

export default function InboundFlowPage(){
  const [poNo,setPoNo]=useState("");
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <input
          className="border rounded-md px-3 py-2 text-sm w-80"
          placeholder="Enter PO No (e.g., PO/25/000123)"
          value={poNo}
          onChange={(e)=>setPoNo(e.target.value)}
        />
        <span className="text-xs text-slate-500">Tip: click nodes to toggle stage tables</span>
      </div>
      <InboundPOFlow poNo={poNo} orientation="horizontal" stageHeightVh={56}/>
    </div>
  );
}
