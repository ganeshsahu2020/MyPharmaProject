// scripts/index-docs.mjs
// Robust PDF indexer: logs clearly, refuses to run if no PDFs, and uses a safe import path for pdf-parse.

import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse/lib/pdf-parse.js"; // ← use library entry, avoids test fallback
import {RecursiveCharacterTextSplitter} from "langchain/text_splitter";
import OpenAI from "openai";
import {createClient} from "@supabase/supabase-js";

const openai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);

const must=(v,name)=>{if(!v){throw new Error(`${name} missing`);}};

must(process.env.OPENAI_API_KEY,"OPENAI_API_KEY");
must(process.env.SUPABASE_URL,"SUPABASE_URL");
must(process.env.SUPABASE_SERVICE_ROLE_KEY,"SUPABASE_SERVICE_ROLE_KEY");

const embed=async (texts)=>{
  const r=await openai.embeddings.create({model:"text-embedding-3-small",input:texts});
  return r.data.map((d)=>d.embedding);
};

const splitPages=(raw)=>raw.split("\f");
const chunkPage=async (text,opts={chunkSize:900,chunkOverlap:120})=>{
  const splitter=new RecursiveCharacterTextSplitter(opts);
  return await splitter.splitText(text);
};

const upsertFile=async (absFile)=>{
  const file=path.basename(absFile);
  console.log(`[parse] ${file}`);
  const buf=fs.readFileSync(absFile);
  if(!Buffer.isBuffer(buf)||buf.length===0){throw new Error(`Empty/invalid buffer for ${file}`);}

  const parsed=await pdfParse(buf);
  const raw=parsed.text||"";
  if(!raw.trim()){console.warn(`[warn] No extractable text in ${file} (scanned image?)`);}

  const pages=splitPages(raw);
  await supabase.from("ai_documents").delete().contains("meta",{filename:file});

  let rows=[];
  for(let i=0;i<pages.length;i++){
    const p=i+1;
    const chunks=await chunkPage(pages[i]||"");
    rows=rows.concat(chunks.map((c)=>({title:file,source:`${file}#p${p}`,chunk:c,meta:{filename:file,page:p}})));
  }

  for(let i=0;i<rows.length;i+=40){
    const slice=rows.slice(i,i+40);
    const vectors=await embed(slice.map((r)=>r.chunk));
    const toInsert=slice.map((r,idx)=>({...r,embedding:vectors[idx]}));
    const {error}=await supabase.from("ai_documents").insert(toInsert);
    if(error){throw error;}
    console.log(`[db] inserted ${toInsert.length} chunks for ${file}`);
  }
};

const run=async ()=>{
  const folderArg=process.argv[2]||"./knowledge";
  const folder=path.resolve(process.cwd(),folderArg);
  if(!fs.existsSync(folder)){throw new Error(`Folder not found: ${folder}`);}
  const files=fs.readdirSync(folder).filter((f)=>f.toLowerCase().endsWith(".pdf"));
  console.log(`[scan] folder: ${folder}`);
  console.log(`[scan] found PDFs: ${files.length}`);
  if(files.length===0){throw new Error("No PDFs found. Add a PDF to /knowledge and retry.");}

  for(const f of files){
    const absFile=path.join(folder,f);
    await upsertFile(absFile);
  }
  console.log("[done] indexing complete");
};

run().catch((e)=>{console.error(e);process.exit(1);});
