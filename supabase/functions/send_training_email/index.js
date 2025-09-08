// supabase/functions/send_training_email/index.js
import {serve} from "https://deno.land/std@0.224.0/http/server.ts";

const RESEND_API_KEY=Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL=Deno.env.get("FROM_EMAIL")||"Training <no-reply@example.com>";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};

function textToHtml(text){
  const esc=(s)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,sans-serif;white-space:pre-wrap">${esc(text||"")}</div>`;
}

serve(async(req)=>{
  if(req.method==="OPTIONS"){
    return new Response("ok",{status:200,headers:corsHeaders});
  }
  if(req.method!=="POST"){
    return new Response("Method not allowed",{status:405,headers:corsHeaders});
  }

  let payload;
  try{ payload=await req.json(); }catch{ 
    return new Response("Invalid JSON",{status:400,headers:corsHeaders});
  }

  if(!payload?.subject||!Array.isArray(payload?.recipients)||payload.recipients.length===0){
    return new Response("Missing subject/recipients",{status:400,headers:corsHeaders});
  }

  const html=payload.html??textToHtml(payload.body||"");

  const r=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{Authorization:`Bearer ${RESEND_API_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify({
      from:FROM_EMAIL,
      to:payload.recipients,
      subject:payload.subject,
      html,
      text:payload.body||""
    })
  });

  if(!r.ok){
    const err=await r.text();
    return new Response(JSON.stringify({ok:false,error:err}),{status:500,headers:{...corsHeaders,"Content-Type":"application/json"}});
  }

  const data=await r.json();
  return new Response(JSON.stringify({ok:true,data}),{headers:{...corsHeaders,"Content-Type":"application/json"}});
});
