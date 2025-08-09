// src/components/masters/LabelMaster.jsx
import React,{useState,useEffect,useMemo,useRef} from 'react';
import {supabase} from '../../../utils/supabaseClient';
import toast from 'react-hot-toast';
import {
  Tag,Hash,Type,Ruler,Braces,Building2,Package2,PanelTop,PanelBottom,
  FileText,Save,Plus,Edit3,Trash2,Search,Eye,Printer,Barcode,GripVertical,AlertTriangle
} from 'lucide-react';

/* utils */
const cls=(...a)=>a.filter(Boolean).join(' ');
const badgeColor=(s)=>((s||'').toLowerCase()==='active'?'bg-emerald-100 text-emerald-700 border-emerald-200':(s||'').toLowerCase()==='inactive'?'bg-slate-100 text-slate-600 border-slate-200':'bg-amber-100 text-amber-700 border-amber-200');
const pretty=(k)=>String(k||'').replace(/[_\-]+/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\b(id|uid)\b/ig,(m)=>m.toUpperCase()).replace(/\bpo\b/ig,'PO').replace(/\bgrn\b/ig,'GRN').replace(/\buom\b/ig,'UOM').replace(/^\w/,c=>c.toUpperCase());
const renderTemplate=(t,v)=>(t||'').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,(_,k)=>v?.[k]??'');
const parseDimension=(s)=>{if(!s) return {w:100,h:50}; const m=String(s).toLowerCase().replace(/\s+/g,'').match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(mm|cm|in)?$/); if(!m) return {w:100,h:50}; let w=parseFloat(m[1]),h=parseFloat(m[2]); const u=m[3]||'mm'; if(u==='cm'){w*=10;h*=10;} if(u==='in'){w*=25.4;h*=25.4;} return {w,h};};
const extractVars=(...parts)=>{const set=new Set(); parts.filter(Boolean).forEach((p)=>{for(const m of p.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)){set.add(m[1]);}}); return Array.from(set);}

/* user prefs */
const PREF_KEY='dx_label_prefs';
const loadPrefs=()=>{try{return JSON.parse(localStorage.getItem(PREF_KEY)||'{}');}catch{return {};}};
const savePrefs=(p)=>{try{localStorage.setItem(PREF_KEY,JSON.stringify(p));}catch{}};

/* Code128 (SMART) */
const C128P=['11011001100','11001101100','11001100110','10010011000','10010001100','10001001100','10011001000','10011000100','10001100100','11001001000','11001000100','11000100100','10110011100','10011011100','10011001110','10111001100','10011101100','10011100110','11001110010','11001011100','11001001110','11011100100','11001110100','11101101110','11101001100','11100101100','11100100110','11101100100','11100110100','11100110010','11011011000','11011000110','11000110110','10100011000','10001011000','10001000110','10110001000','10001101000','10001100010','11010001000','11000101000','11000100010','10110111000','10110001110','10001101110','10111011000','10111000110','10001110110','11101110110','11010001110','11000101110','11011101000','11011100010','11011101110','11101011000','11101000110','11100010110','11101101000','11101100010','11100011010','11101111010','11001000010','11110001010','10100110000','10100001100','10010110000','10010000110','10000101100','10000100110','10110010000','10110000100','10011010000','10011000010','10000110100','10000110010','11000010010','11001010000','11110111010','11000010100','10001111010','10100111100','10010111100','10010011110','10111100100','10011110100','10011110010','11110100100','11110010100','11110010010','11011011110','11011110110','11110110110','10101111000','10100011110','10001011110','10111101000','10111100010','11110101000','11110100010','10111011110','10111101110','11101011110','11110101110','11010000100','11010010000','11010011100','1100011101011'];
const START={B:104,C:105},SW={B:100,C:99};
const vB=(ch)=>{const c=ch.charCodeAt(0); if(c<32||c>126) throw 0; return c-32;};
const runDigits=(s,i)=>{let k=i; while(k<s.length&&/[0-9]/.test(s[k])) k++; return k-i;};
const pairC=(s,i)=>parseInt(s.slice(i,i+2),10);
const code128Smart=(text)=>{const s=text||''; const out=[START.B]; let i=0,mode='B'; while(i<s.length){const n=runDigits(s,i); if(n>=4){const take=n-(n%2); if(mode!=='C'){out.push(SW.C); mode='C';} for(let k=0;k<take;k+=2) out.push(pairC(s,i+k)); i+=take; if(i<s.length){out.push(SW.B); mode='B';} continue;} if(mode!=='B'){out.push(SW.B); mode='B';} out.push(vB(s[i])); i++;} let sum=out[0]; for(let w=1;w<out.length;w++) sum+=out[w]*w; const chk=sum%103; return [...out,chk,106];};

/* Scalable SVG that fills its container (width & height) */
const Code128Svg=({value,margin=2,showHuman=false})=>{
  let codes; try{codes=code128Smart(value);}catch{codes=code128Smart('INVALID');}
  const pattern=codes.map((v)=>C128P[v]).join('');
  const barWidth=1;               // logical units for viewBox
  const height=36;                // logical bar height in viewBox
  const humanOffset=12;           // reserved space in viewBox for text (not used here)
  const width=pattern.length*barWidth+margin*2;
  const h=height+humanOffset+margin*2;

  let x=margin; const bars=[];
  for(const b of pattern){ if(b==='1'){ bars.push(<rect key={x} x={x} y={margin} width={barWidth} height={height}/>); } x+=barWidth; }

  return (
    <svg
      viewBox={`0 0 ${width} ${h}`}
      style={{width:'100%',height:'100%'}}
      preserveAspectRatio="none"
    >
      <g fill="#111">{bars}</g>
    </svg>
  );
};

/* Smart QR (v1–10) */
const QR_EC_MAP={L:1,M:0,Q:3,H:2};
const QR_CAP_AN={1:{L:25,M:20,Q:16,H:10},2:{L:47,M:38,Q:29,H:20},3:{L:77,M:61,Q:47,H:35},4:{L:114,M:90,Q:67,H:50},5:{L:154,M:122,Q:87,H:64},6:{L:195,M:154,Q:108,H:84},7:{L:224,M:178,Q:125,H:93},8:{L:279,M:221,Q:157,H:122},9:{L:335,M:262,Q:189,H:143},10:{L:395,M:311,Q:221,H:174}};
const QR_CAP_BYTE={1:{L:17,M:14,Q:11,H:7},2:{L:32,M:26,Q:20,H:14},3:{L:53,M:42,Q:32,H:24},4:{L:78,M:62,Q:46,H:34},5:{L:106,M:84,Q:60,H:44},6:{L:134,M:106,Q:74,H:58},7:{L:154,M:122,Q:86,H:64},8:{L:192,M:152,Q:108,H:84},9:{L:230,M:180,Q:130,H:98},10:{L:271,M:213,Q:151,H:119}};
const QR_BLOCKS={1:{L:[1,7],M:[1,10],Q:[1,13],H:[1,17]},2:{L:[1,10],M:[1,16],Q:[1,22],H:[1,28]},3:{L:[1,15],M:[1,26],Q:[2,18],H:[2,22]},4:{L:[1,20],M:[2,18],Q:[2,26],H:[4,16]},5:{L:[1,26],M:[2,24],Q:[2,18],H:[2,22]},6:{L:[2,18],M:[4,16],Q:[4,24],H:[4,28]},7:{L:[2,20],M:[4,18],Q:[6,18],H:[5,26]},8:{L:[2,24],M:[4,22],Q:[6,22],H:[6,26]},9:{L:[2,30],M:[5,22],Q:[8,20],H:[8,24]},10:{L:[4,18],M:[5,26],Q:[8,24],H:[8,28]}};
const gfExp=new Uint8Array(512),gfLog=new Uint8Array(256);
(()=>{let x=1;for(let i=0;i<255;i++){gfExp[i]=x;gfLog[x]=i;x<<=1;if(x&0x100)x^=0x11d;}for(let i=255;i<512;i++)gfExp[i]=gfExp[i-255];})();
const rsGen=(n)=>{let p=[1];for(let i=0;i<n;i++){const a=gfExp[i];const q=new Array(p.length+1).fill(0);for(let j=0;j<p.length;j++){q[j]^=p[j];q[j+1]^=(p[j]?gfExp[(gfLog[p[j]]+a)%255]:0);}p=q}return p};
const rsEncode=(data,ec)=>{const g=rsGen(ec);const res=new Uint8Array(ec);for(const d of data){const k=d^res[0];res.copyWithin(0,1);res[res.length-1]=0;if(k){for(let i=0;i<g.length;i++){res[i]^=gfExp[(gfLog[k]+g[i])%255];}}}return res};
const bits=(arr,val,len)=>{for(let i=len-1;i>=0;i--) arr.push((val>>i)&1);};
const ALNUM=/^[0-9A-Z \$%\*\+\-\.\/:]+$/;
const alVal=(ch)=>"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:".indexOf(ch);
const chooseQR=(text,ec)=>{const EC=(ec in QR_EC_MAP)?ec:'M'; if(ALNUM.test(text||'')){for(let v=1;v<=10;v++){if((text||'').length<=QR_CAP_AN[v][EC]) return {mode:'AN',ver:v,ec:EC};}}
  const b=new TextEncoder().encode(text||''); for(let v=1;v<=10;v++){if(b.length<=QR_CAP_BYTE[v][EC]) return {mode:'BYTE',ver:v,ec:EC,bytes:b};}
  throw new Error('QR too large (max v10)');};
const makeQR=({text,ec='M'})=>{
  const {mode,ver,ec:EC,bytes}=chooseQR(text,ec); const n=17+4*ver; const out=[];
  bits(out,mode==='AN'?0b0010:0b0100,4);
  const lenBits=(mode==='AN')?(ver<=9?9:11):(ver<=9?8:16);
  if(mode==='AN'){bits(out,(text||'').length,lenBits); const s=text||''; for(let i=0;i<s.length;i+=2){if(i+1<s.length){bits(out,alVal(s[i])*45+alVal(s[i+1]),11);}else bits(out,alVal(s[i]),6);}}
  else{bits(out,(bytes||new Uint8Array()).length,lenBits); for(const b of (bytes||new Uint8Array())) bits(out,b,8);}
  const cap=QR_CAP_BYTE[ver][EC]; const total=cap*8; bits(out,0,Math.min(4,total-out.length)); while(out.length%8) out.push(0);
  const data=[]; for(let i=0;i<out.length;i+=8) data.push(parseInt(out.slice(i,i+8).join(''),2));
  const pad=[0xec,0x11]; let pi=0; while(data.length<cap) data.push(pad[pi++%2]);
  const [nb,ecPer]=QR_BLOCKS[ver][EC];
  const blen=Math.floor(data.length/nb);           // ✅ critical line (fixes blank screen)
  const blks=[]; let off=0;
  for(let i=0;i<nb;i++){const len=(i===nb-1?(data.length-off):blen); const d=data.slice(off,off+len); off+=len; blks.push({d,ec:Array.from(rsEncode(d,ecPer))});}
  const inter=[]; for(let i=0;i<blen;i++) for(const b of blks) if(i<b.d.length) inter.push(b.d[i]); for(let i=0;i<ecPer;i++) for(const b of blks) inter.push(b.ec[i]);
  const M=Array.from({length:n},()=>Array(n).fill(null));
  const finder=(r,c)=>{for(let y=-1;y<=7;y++) for(let x=-1;x<=7;x++){const rr=r+y,cc=c+x;if(rr<0||cc<0||rr>=n||cc>=n) continue; const in5=y>=0&&y<=6&&x>=0&&x<=6; const on=(y===0||y===6||x===0||x===6)||(y>=2&&y<=4&&x>=2&&x<=4); M[rr][cc]=in5?on:0;}}; finder(0,0); finder(0,n-7); finder(n-7,0);
  for(let i=8;i<n-8;i++) M[6][i]=M[i][6]=(i%2===0)?1:0;
  let dir=-1,col=n-1,bi=0,bit=7,cur=inter[0]??0; const next=()=>{const v=(cur>>bit)&1; bit--; if(bit<0){bi++; cur=inter[bi]??0; bit=7;} return v;};
  while(col>0){if(col===6) col--; for(let row=(dir<0?n-1:0); dir<0?row>=0:row<n; row+=dir<0?-1:1){for(let c=0;c<2;c++){const cc=col-c; if(M[row][cc]!==null) continue; M[row][cc]=next();}} col-=2; dir*=-1;}
  const apply=(m)=>M.map((r,y)=>r.map((v,x)=>{if(v===0||v===1){const mk=m===0?((y+x)%2===0):m===1?(y%2===0):m===2?(x%3===0):((y%3+x%2)%2===0); return v^(mk?1:0);} return v;}));
  let best=apply(0),bp=1e9,bm=0; for(let m=0;m<=3;m++){const Am=apply(m); let p=0; for(let y=0;y<n;y++){let run=1; for(let x=1;x<n;x++){if(Am[y][x]===Am[y][x-1]) run++; else{if(run>=5)p+=3+(run-5); run=1;}} if(run>=5)p+=3+(run-5);} for(let x=0;x<n;x++){let run=1; for(let y=1;y<n;y++){if(Am[y][x]===Am[y-1][x]) run++; else{if(run>=5)p+=3+(run-5); run=1;}} if(run>=5)p+=3+(run-5);} if(p<bp){bp=p; bm=m; best=Am;}}
  const fmt=((QR_EC_MAP[EC]<<3)|bm)^0x5412;
  const B=best.map((r)=>r.slice());
  for(let i=0;i<6;i++){B[8][i]=(fmt>>i)&1; B[i][8]=(fmt>>i)&1;} B[8][7]=(fmt>>6)&1; B[8][8]=(fmt>>7)&1; B[7][8]=(fmt>>8)&1;
  for(let i=0;i<7;i++){B[n-1-i][8]=(fmt>>(14-i))&1; B[8][n-1-i]=(fmt>>(14-i))&1;}
  return {size:n,modules:B};
};
const QRSvg=({value,ec='M',scale=2,margin=2})=>{
  try{
    const qr=makeQR({text:value||'',ec});
    const n=qr.size,s=(n+margin*2)*scale,cells=[];
    for(let y=0;y<n;y++) for(let x=0;x<n;x++){if(qr.modules[y][x]) cells.push(<rect key={`${x}-${y}`} x={(x+margin)*scale} y={(y+margin)*scale} width={scale} height={scale}/>);}
    return (<svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}><g fill="#111">{cells}</g></svg>);
  }catch{
    // Never break the tree; show a tiny placeholder
    return (<div style={{width:24,height:24,background:'#eee',border:'1px solid #ddd'}} />);
  }
};

/* skeleton row */
const skel=(k)=>(<tr key={k} className="animate-pulse">{Array.from({length:6}).map((_,i)=><td key={i} className="p-2"><div className="h-4 bg-slate-200 rounded"/></td>)}</tr>);

/* helpers */
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const snapTo=(val,mm)=>Math.round(val/mm)*mm;

const LabelMaster=()=>{
  /* lookups */
  const [plants,setPlants]=useState([]);
  const [modules,setModules]=useState([]);

  /* rows */
  const [labels,setLabels]=useState([]);

  /* selections */
  const [selectedPlant,setSelectedPlant]=useState('');
  const [selectedModuleName,setSelectedModuleName]=useState('');
  const [selectedSubmoduleName,setSelectedSubmoduleName]=useState('');

  /* form */
  const [form,setForm]=useState({
    id:null,label_id:'',label_name:'',process_stage:'',label_type:'',label_dimension:'',
    header_template:'',body_template:'',footer_template:'',template:'',
    variables:[],status:'Active'
  });
  const [sampleValues,setSampleValues]=useState({});

  /* ui */
  const [search,setSearch]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [listLoading,setListLoading]=useState(true);
  const [previewMode,setPreviewMode]=useState('print');
  const [theme,setTheme]=useState('compact');
  const [showRuler,setShowRuler]=useState(false);
  const [showHuman,setShowHuman]=useState(true);
  const [useQr,setUseQr]=useState(false);
  const [qrEc,setQrEc]=useState('M');
  const [layoutMode,setLayoutMode]=useState('designed');

  /* user prefs */
  const prefsRef=useRef(loadPrefs());
  const getPref=(k,def)=>prefsRef.current?.[k]??def;
  const setPref=(k,v)=>{prefsRef.current={...prefsRef.current,[k]:v}; savePrefs(prefsRef.current);};

  /* per-label layout toggles */
  const [edgeSnap,setEdgeSnap]=useState(true);
  const [showGridGuides,setShowGridGuides]=useState(true);
  const [showSafeArea,setShowSafeArea]=useState(true);
  const [sidePane,setSidePane]=useState(false);

  /* preview refs */
  const previewRef=useRef(null);
  const labelBoxRef=useRef(null);
  const bodyBoxRef=useRef(null);

  /* derived lists */
  const plantMap=useMemo(()=>Object.fromEntries(plants.map((p)=>[p.id,`${p.plant_id} — ${p.description}`])),[plants]);
  const moduleNames=useMemo(()=>Array.from(new Set(modules.map((m)=>(m.module||'').trim()))).sort(),[modules]);
  const submoduleNames=useMemo(()=>{
    const pick=(selectedModuleName||'').trim();
    return modules.filter((m)=>((m.module||'').trim()===pick)).map((m)=>(m.submodule||'').trim()).filter((s,i,a)=>a.indexOf(s)===i).sort();
  },[modules,selectedModuleName]);
  const resolveRefByNames=(mod,sub)=>modules.find((m)=>((m.module||'').trim()===(mod||'').trim())&&((m.submodule||'').trim()===(sub||'').trim()))?.id||null;

  const filtered=useMemo(()=>{
    if(!search) return labels;
    const q=search.toLowerCase();
    return labels.filter((l)=>[l.label_id,l.label_name,l.process_stage,l.label_type,l.module_id,l.submodule_id].filter(Boolean).some((v)=>String(v).toLowerCase().includes(q)));
  },[labels,search]);

  const composedText=useMemo(()=>{
    const h=renderTemplate(form.header_template,sampleValues);
    const b=renderTemplate(form.body_template,sampleValues);
    const f=renderTemplate(form.footer_template,sampleValues);
    return `${h}\n${b}\n${f}`.trim();
  },[form.header_template,form.body_template,form.footer_template,sampleValues]);

  /* variables */
  const importantKeys=['grn','po','material','batch','qty','uom','mfg','exp','mrp','vehicle','transporter','company','plant','date','barcode','qrcode'];
  const templateVars=useMemo(()=>extractVars(form.header_template,form.body_template,form.footer_template),[form.header_template,form.body_template,form.footer_template]);
  useEffect(()=>{
    const merged=Array.from(new Set([...(form.variables||[]),...templateVars,...importantKeys]));
    if(merged.length!==(form.variables||[]).length){setForm((f)=>({...f,variables:merged}));}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[templateVars.join('|')]);

  /* designed rows — hide placeholders */
  const designedRows=useMemo(()=>{
    const order=[...new Set([...importantKeys,...(form.variables||[]).map((k)=>k.toLowerCase())])];
    return order.map((lk)=>{
      const real=(form.variables||[]).find((k)=>k.toLowerCase()===lk)||lk;
      const val=sampleValues?.[real];
      return {key:real,label:pretty(real),val};
    }).filter((r)=>r.val!==undefined&&r.val!=='');
  },[form.variables,sampleValues]);

  /* load data */
  useEffect(()=>{(async()=>{
    try{
      setLoading(true);
      const lookups=toast.promise(Promise.all([
        supabase.from('plant_master').select('id,plant_id,description').order('plant_id'),
        supabase.from('modules_combined').select('id,module,submodule').order('module')
      ]),{loading:'Loading…',success:'Ready',error:'Load failed'});
      const [{data:plantData},{data:mods}]=await lookups;
      setPlants(plantData||[]); setModules(mods||[]);
      await fetchLabels();
    }finally{setLoading(false);}
  })();},[]);

  const fetchLabels=async()=>{
    setListLoading(true);
    try{
      const {data,error}=await supabase.from('label_master').select('*').order('created_at',{ascending:false});
      if(error) throw error;
      setLabels(data||[]);
    }catch(err){console.error(err); toast.error('Labels load failed');}
    finally{setListLoading(false);}
  };

  useEffect(()=>{if(!selectedModuleName) setSelectedSubmoduleName('');},[selectedModuleName]);

  /* dims + theme */
  const {w:stdW,h:stdH}=parseDimension(form.label_dimension||'100x50 mm');
  useEffect(()=>{
    const {w,h}=parseDimension(form.label_dimension||'');
    const near50x25=Math.abs((w||0)-50)<0.5 && Math.abs((h||0)-25)<0.5;
    if(theme==='compact'&&!near50x25&&form.label_dimension){setTheme('standard');}
  },[form.label_dimension,theme]);
  const dimW=theme==='compact'?50:stdW;
  const dimH=theme==='compact'?25:stdH;

  /* pane width + persist */
  const [codePaneW,setCodePaneW]=useState(18);
  useEffect(()=>{
    const p=sampleValues?._layout?.paneW;
    if(typeof p==='number'&&p>10&&p<dimW-20){setCodePaneW(p);} else {setCodePaneW(theme==='compact'?18:22);}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[form.id,dimW,theme]);

  const mmToPx=(mm,box)=>{if(!box||!box.clientWidth) return mm*3.78; return mm*(box.clientWidth/dimW);};
  const pxToMm=(px,box)=>{if(!box||!box.clientWidth) return px/3.78; return px*(dimW/box.clientWidth);};

  const startResize=(e)=>{
    const box=labelBoxRef.current; if(!box) return;
    e.preventDefault();
    const startX=e.clientX; const startW=codePaneW;
    const onMove=(ev)=>{
      const dx=ev.clientX-startX;
      const dmm=pxToMm(dx,box);
      const next=Math.max(10,Math.min(dimW-30,startW+dmm));
      setCodePaneW(next);
    };
    const onUp=()=>{window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp);};
    window.addEventListener('mousemove',onMove);
    window.addEventListener('mouseup',onUp);
  };

  /* snapping / drag */
  const [dragging,setDragging]=useState(null);
  const [isDragging,setIsDragging]=useState(false);
  const [warnOut,setWarnOut]=useState(false);
  const snapMm=useMemo(()=>sampleValues?._layout?.snapMm??(prefsRef.current?.defaultSnapMm??0.5),[sampleValues]);

  const getBodySafeRectMm=()=>{
    const label=labelBoxRef.current; const body=bodyBoxRef.current;
    if(!label||!body) return {x:0,y:0,w:dimW,h:dimH};
    const lb=label.getBoundingClientRect();
    const bb=body.getBoundingClientRect();
    const x=pxToMm(bb.left-lb.left,label);
    const y=pxToMm(bb.top-lb.top,label);
    const w=pxToMm(bb.width,label);
    const h=pxToMm(bb.height,label);
    return {x,y,w,h};
  };

  /* === Tunable sizes (persisted) === */
  const QR_SIZE_MM=18;
  const BARCODE_DEFAULT_W_MM=40;
  const BARCODE_DEFAULT_H_MM=10;

  const barcodeWmm = useMemo(
    ()=> clamp(Number(sampleValues?._layout?.barcodeWmm ?? BARCODE_DEFAULT_W_MM), 10, 120),
    [sampleValues]
  );
  const barcodeHmm = useMemo(
    ()=> clamp(Number(sampleValues?._layout?.barcodeHmm ?? BARCODE_DEFAULT_H_MM), 6, 30),
    [sampleValues]
  );

  const getElSizeMm=(type)=> type==='qr'?QR_SIZE_MM:barcodeWmm;
  const getPos=(type)=>{
    const pos=sampleValues?._layout?.[type];
    if(pos&&typeof pos.x==='number'&&typeof pos.y==='number') return pos;
    const safe=getBodySafeRectMm();
    return {x:safe.x+safe.w-getElSizeMm(type)-2,y:safe.y+2};
  };
  const setPos=(type,xy)=>{
    setSampleValues((s)=>{
      const lay={...(s?._layout||{})};
      lay[type]={x:xy.x,y:xy.y};
      return {...s,_layout:lay};
    });
  };
  const dragStart=(type,e)=>{
    e.preventDefault();
    setDragging(type); setIsDragging(true);
    const box=labelBoxRef.current; if(!box) return;
    const startX=e.clientX, startY=e.clientY;
    const start=getPos(type);
    const onMove=(ev)=>{
      const dx=pxToMm(ev.clientX-startX,box);
      const dy=pxToMm(ev.clientY-startY,box);
      const safe=getBodySafeRectMm();
      let nx=start.x+dx, ny=start.y+dy;
      if(snapMm>0){nx=snapTo(nx,snapMm); ny=snapTo(ny,snapMm);}
      if(sampleValues?._layout?.edgeSnap ?? edgeSnap){
        if(Math.abs(nx-safe.x)<snapMm) nx=safe.x;
        if(Math.abs(ny-safe.y)<snapMm) ny=safe.y;
        if(Math.abs((nx+getElSizeMm(type))-(safe.x+safe.w))<snapMm) nx=safe.x+safe.w-getElSizeMm(type);
        if(Math.abs((ny+(type==='qr'?QR_SIZE_MM:barcodeHmm))-(safe.y+safe.h))<snapMm) ny=safe.y+safe.h-(type==='qr'?QR_SIZE_MM:barcodeHmm);
      }
      const maxX=safe.x+safe.w-getElSizeMm(type);
      const maxY=safe.y+safe.h-(type==='qr'?QR_SIZE_MM:barcodeHmm);
      const cx=Math.max(safe.x,Math.min(maxX,nx));
      const cy=Math.max(safe.y,Math.min(maxY,ny));
      setPos(type,{x:cx,y:cy});
      setWarnOut(nx!==cx||ny!==cy);
    };
    const onUp=()=>{
      setIsDragging(false); setDragging(null);
      window.removeEventListener('mousemove',onMove);
      window.removeEventListener('mouseup',onUp);
    };
    window.addEventListener('mousemove',onMove);
    window.addEventListener('mouseup',onUp);
  };

  /* alignment */
  const [alignHeader,setAlignHeader]=useState('left');
  const [alignBody,setAlignBody]=useState('left');
  const [alignFooter,setAlignFooter]=useState('left');

  /* basic field handlers */
  const setField=(k,v)=>setForm((f)=>({...f,[k]:v}));
  const addVar=()=>setForm((f)=>({...f,variables:[...(f.variables||[]),'']}));
  const updVar=(i,val)=>setForm((f)=>{const v=[...(f.variables||[])]; const old=v[i]; v[i]=val; const sv={...sampleValues}; if(old&&old!==val){sv[val]=sv[old]??''; delete sv[old];} setSampleValues(sv); return {...f,variables:v};});
  const delVar=(i)=>setForm((f)=>{const v=[...(f.variables||[])]; const rem=v[i]; v.splice(i,1); if(rem){const sv={...sampleValues}; delete sv[rem]; setSampleValues(sv);} return {...f,variables:v};});

  /* edit / delete / save */
  const onEdit=(row)=>{
    setForm({
      id:row.id||null,label_id:row.label_id||'',label_name:row.label_name||'',
      process_stage:row.process_stage||'',label_type:row.label_type||'',label_dimension:row.label_dimension||'',
      header_template:row.header_template||'',body_template:row.body_template||'',footer_template:row.footer_template||'',
      template:row.template||'',variables:Array.isArray(row.variables)?row.variables:(row.variables?.variables||[]),status:row.status||'Active'
    });
    setSelectedPlant(row.plant_uid||'');
    setSelectedModuleName(row.module_id||'');
    setSelectedSubmoduleName(row.submodule_id||'');
    const sv=row.sample_values||{};
    setSampleValues(sv);
    setEdgeSnap((sv?._layout?.edgeSnap) ?? (getPref('edgeSnap',true)));
    setShowGridGuides((sv?._layout?.gridGuides) ?? (getPref('showGridGuides',true)));
    setShowSafeArea((sv?._layout?.safeArea) ?? (getPref('showSafeArea',true)));
    setSidePane(!!sv?._layout?.sidePane);
    if(sv?._layout?.paneW){setCodePaneW(sv._layout.paneW);}
    setPreviewMode('print');
    window.scrollTo({top:0,behavior:'smooth'});
  };

  const onDelete=async(id)=>{
    await toast.promise(supabase.from('label_master').delete().eq('id',id),{loading:'Deleting…',success:'Deleted',error:'Delete failed'});
    await fetchLabels();
  };

  const resetForm=()=>{
    setForm({id:null,label_id:'',label_name:'',process_stage:'',label_type:'',label_dimension:'',header_template:'',body_template:'',footer_template:'',template:'',variables:[],status:'Active'});
    setSelectedPlant(''); setSelectedModuleName(''); setSelectedSubmoduleName('');
    setSampleValues({});
    setSidePane(false);
  };

  const onSave=async()=>{
    if(!form.label_id||!form.label_name){toast.error('Label ID & Name required');return;}
    if(!selectedPlant){toast.error('Select Plant');return;}
    const module_ref=resolveRefByNames(selectedModuleName,selectedSubmoduleName);
    const layout={...(sampleValues?._layout||{})};
    layout.paneW=codePaneW;
    layout.snapMm=Number(snapMm)||0.5;
    layout.edgeSnap=edgeSnap;
    layout.gridGuides=showGridGuides;
    layout.safeArea=showSafeArea;
    layout.sidePane=sidePane;
    const payload={
      label_id:form.label_id,label_name:form.label_name,
      process_stage:form.process_stage||null,label_type:form.label_type||null,label_dimension:form.label_dimension||null,
      header_template:form.header_template||null,body_template:form.body_template||null,footer_template:form.footer_template||null,
      template:form.template||null,
      variables:(form.variables&&form.variables.length)?form.variables:null,
      sample_values:{...sampleValues,_layout:layout},
      module_id:selectedModuleName||null,submodule_id:selectedSubmoduleName||null,module_ref,
      plant_uid:selectedPlant,status:form.status||'Active'
    };
    setPref('edgeSnap',edgeSnap);
    setPref('showGridGuides',showGridGuides);
    setPref('showSafeArea',showSafeArea);
    setPref('defaultSnapMm',layout.snapMm);

    setSaving(true);
    try{
      if(form.id){await toast.promise(supabase.from('label_master').update(payload).eq('id',form.id),{loading:'Updating…',success:'Updated',error:'Update failed'});}
      else{await toast.promise(supabase.from('label_master').insert([payload]),{loading:'Saving…',success:'Created',error:'Save failed'});}
      resetForm(); await fetchLabels();
    }finally{setSaving(false);}
  };

  /* print only the label box */
  const printNow=()=>{
    const box=labelBoxRef.current;
    if(!box){window.print();return;}
    const html=box.outerHTML;
    const win=window.open('','_blank','width=900,height=700'); if(!win) return;
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Print Label</title>
<style>
  @page{size:${dimW}mm ${dimH}mm;margin:0;}
  html,body{height:100%}
  body{margin:0;display:flex;align-items:center;justify-content:center;background:white;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,'Helvetica Neue',Arial;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .dx-label{box-sizing:border-box;overflow:hidden;page-break-inside:avoid}
</style>
</head><body>${html.replace('<div','<div class="dx-label"')}</body>
<script>window.onload=()=>{setTimeout(()=>window.print(),60);setTimeout(()=>window.close(),300);};</script></html>`);
    win.document.close();
  };

  if(loading){
    return (
      <div className="p-4 space-y-3">
        <div className="h-6 w-40 bg-slate-200 rounded animate-pulse"/>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="h-10 bg-slate-200 rounded animate-pulse"/>)}</div>
        <div className="h-40 bg-slate-200 rounded animate-pulse"/>
      </div>
    );
  }

  const LSwitch=({label,checked,onChange})=>(
    <label className="text-xs flex items-center gap-1 ml-2">
      <input type="checkbox" checked={!!checked} onChange={(e)=>onChange(e.target.checked)}/>
      {label}
    </label>
  );

  /* slider bounds */
  const barcodeMinW=10;
  const barcodeMaxW=Math.max(30, Math.min(120, Math.round(dimW-6)));
  const barcodeMinH=6;
  const barcodeMaxH=30;

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2"><Tag size={18} className="text-blue-600"/> Label Master</h2>

      {/* Controls / prefs */}
      <div className="flex flex-wrap items-center gap-3 border rounded p-2">
        <div className="flex items-center gap-2 text-xs">
          <GripVertical size={14} className="text-slate-600"/>
          <span>Snap (mm):</span>
          <input
            type="range" min="0.1" max="2" step="0.05"
            value={String(sampleValues?._layout?.snapMm??(prefsRef.current?.defaultSnapMm??0.5))}
            onChange={(e)=>{const v=parseFloat(e.target.value)||0.5; setSampleValues((s)=>({...s,_layout:{...(s?._layout||{}),snapMm:v}})); setPref('defaultSnapMm',v);}}
          />
          <span className="font-mono">{Number(sampleValues?._layout?.snapMm??(prefsRef.current?.defaultSnapMm??0.5)).toFixed(2)}mm</span>
        </div>

        {/* NEW: Barcode width */}
        <div className="flex items-center gap-2 text-xs">
          <Barcode size={14} className="text-slate-700"/>
          <span>Barcode width (mm):</span>
          <input
            type="range" min={barcodeMinW} max={barcodeMaxW} step="1"
            value={String(barcodeWmm)}
            onChange={(e)=>{
              const v=clamp(parseFloat(e.target.value)||BARCODE_DEFAULT_W_MM, barcodeMinW, barcodeMaxW);
              setSampleValues((s)=>({...s,_layout:{...(s?._layout||{}),barcodeWmm:v}}));
            }}
          />
          <span className="font-mono">{barcodeWmm}mm</span>
        </div>

        {/* NEW: Barcode height */}
        <div className="flex items-center gap-2 text-xs">
          <span>Barcode height (mm):</span>
          <input
            type="range" min={barcodeMinH} max={barcodeMaxH} step="1"
            value={String(barcodeHmm)}
            onChange={(e)=>{
              const v=clamp(parseFloat(e.target.value)||BARCODE_DEFAULT_H_MM, barcodeMinH, barcodeMaxH);
              setSampleValues((s)=>({...s,_layout:{...(s?._layout||{}),barcodeHmm:v}}));
            }}
          />
          <span className="font-mono">{barcodeHmm}mm</span>
        </div>

        <LSwitch label="Edge snap" checked={edgeSnap} onChange={(v)=>setEdgeSnap(v)}/>
        <LSwitch label="Grid guides" checked={showGridGuides} onChange={(v)=>setShowGridGuides(v)}/>
        <LSwitch label="Safe-area outline" checked={showSafeArea} onChange={(v)=>setShowSafeArea(v)}/>
        <LSwitch label="Side pane code" checked={sidePane} onChange={(v)=>setSidePane(v)}/>
        <LSwitch label="Human text" checked={showHuman} onChange={(v)=>setShowHuman(v)}/>
        <LSwitch label="Use QR" checked={useQr} onChange={(v)=>setUseQr(v)}/>
        {useQr&&(
          <select value={qrEc} onChange={(e)=>setQrEc(e.target.value)} className="border rounded px-1 py-0.5 text-xs">
            <option value="L">QR EC: L</option><option value="M">QR EC: M</option><option value="Q">QR EC: Q</option><option value="H">QR EC: H</option>
          </select>
        )}
        <LSwitch label="Compact 50×25mm" checked={theme==='compact'} onChange={(v)=>setTheme(v?'compact':'standard')}/>
        <LSwitch label="Ruler (mm)" checked={showRuler} onChange={(v)=>setShowRuler(v)}/>
        <LSwitch label="Designed layout" checked={layoutMode==='designed'} onChange={(v)=>setLayoutMode(v?'designed':'templated')}/>
      </div>

      {/* Top selectors and fields */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <div className="text-xs text-slate-600 mb-1">Plant</div>
          <div className="relative">
            <Building2 size={16} className="absolute left-2 top-3 text-emerald-600 pointer-events-none"/>
            <select value={selectedPlant} onChange={(e)=>setSelectedPlant(e.target.value)} className="w-full border rounded px-7 py-2 text-sm">
              <option value="">Select Plant</option>
              {plants.map((p)=>(<option key={p.id} value={p.id}>{p.plant_id} — {p.description}</option>))}
            </select>
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-600 mb-1">Module</div>
          <div className="relative">
            <Package2 size={16} className="absolute left-2 top-3 text-indigo-600 pointer-events-none"/>
            <select value={selectedModuleName} onChange={(e)=>setSelectedModuleName(e.target.value)} className="w-full border rounded px-7 py-2 text-sm">
              <option value="">Select Module</option>
              {moduleNames.map((m)=>(<option key={m} value={m}>{m}</option>))}
            </select>
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-600 mb-1">Submodule</div>
          <div className="relative">
            <Package2 size={16} className="absolute left-2 top-3 text-indigo-400 pointer-events-none"/>
            <select value={selectedSubmoduleName} onChange={(e)=>setSelectedSubmoduleName(e.target.value)} className="w-full border rounded px-7 py-2 text-sm" disabled={!selectedModuleName}>
              <option value="">{selectedModuleName?'Select Submodule':'Select Module first'}</option>
              {submoduleNames.map((sm)=>(<option key={sm||'_'} value={sm}>{sm||'(none)'}</option>))}
            </select>
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-600 mb-1">Status</div>
          <div className="relative">
            <Tag size={16} className="absolute left-2 top-3 text-teal-600 pointer-events-none"/>
            <select value={form.status} onChange={(e)=>setField('status',e.target.value)} className="w-full border rounded px-7 py-2 text-sm">
              <option value="Active">Active</option><option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-600 mb-1">Search</div>
          <div className="relative">
            <Search size={16} className="absolute left-2 top-3 text-slate-500 pointer-events-none"/>
            <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search labels…" className="w-full border rounded px-7 py-2 text-sm"/>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div><div className="text-xs text-slate-600 mb-1">Label ID</div><div className="relative"><Hash size={16} className="absolute left-2 top-3 text-fuchsia-600 pointer-events-none"/><input value={form.label_id} onChange={(e)=>setField('label_id',e.target.value)} placeholder="LBL-001" className="w-full border rounded px-7 py-2 text-sm"/></div></div>
        <div><div className="text-xs text-slate-600 mb-1">Label Name</div><div className="relative"><Type size={16} className="absolute left-2 top-3 text-rose-600 pointer-events-none"/><input value={form.label_name} onChange={(e)=>setField('label_name',e.target.value)} placeholder="Inbound Material Label" className="w-full border rounded px-7 py-2 text-sm"/></div></div>
        <div><div className="text-xs text-slate-600 mb-1">Process Stage</div><div className="relative"><FileText size={16} className="absolute left-2 top-3 text-cyan-600 pointer-events-none"/><input value={form.process_stage} onChange={(e)=>setField('process_stage',e.target.value)} placeholder="Goods Receipt" className="w-full border rounded px-7 py-2 text-sm"/></div></div>
        <div><div className="text-xs text-slate-600 mb-1">Type</div><div className="relative"><Tag size={16} className="absolute left-2 top-3 text-amber-600 pointer-events-none"/><input value={form.label_type} onChange={(e)=>setField('label_type',e.target.value)} placeholder="Thermal" className="w-full border rounded px-7 py-2 text-sm"/></div></div>
        <div><div className="text-xs text-slate-600 mb-1">Dimensions</div><div className="relative"><Ruler size={16} className="absolute left-2 top-3 text-lime-700 pointer-events-none"/><input value={form.label_dimension} onChange={(e)=>setField('label_dimension',e.target.value)} placeholder="50x25 mm" className="w-full border rounded px-7 py-2 text-sm"/></div></div>
        <div className="md:col-span-3"><div className="text-xs text-slate-600 mb-1">Compiled Template (optional)</div><div className="relative"><FileText size={16} className="absolute left-2 top-3 text-slate-600 pointer-events-none"/><textarea value={form.template} onChange={(e)=>setField('template',e.target.value)} placeholder="Optional: compiled output" className="w-full border rounded px-7 py-2 text-sm min-h-20"/></div></div>
        <div><div className="text-xs text-slate-600 mb-1">Header Template</div><div className="relative"><PanelTop size={16} className="absolute left-2 top-3 text-violet-600 pointer-events-none"/><textarea value={form.header_template} onChange={(e)=>setField('header_template',e.target.value)} placeholder="Supports {{vars}}" className="w-full border rounded px-7 py-2 text-sm min-h-20"/></div>
          <div className="mt-1">
            <select value={alignHeader} onChange={(e)=>setAlignHeader(e.target.value)} className="border rounded px-2 py-1 text-xs">
              <option value="left">Header: Left</option><option value="center">Header: Center</option><option value="right">Header: Right</option>
            </select>
          </div>
        </div>
        <div><div className="text-xs text-slate-600 mb-1">Body Template</div><div className="relative"><FileText size={16} className="absolute left-2 top-3 text-blue-600 pointer-events-none"/><textarea value={form.body_template} onChange={(e)=>setField('body_template',e.target.value)} placeholder="Supports {{vars}}" className="w-full border rounded px-7 py-2 text-sm min-h-20"/></div>
          <div className="mt-1">
            <select value={alignBody} onChange={(e)=>setAlignBody(e.target.value)} className="border rounded px-2 py-1 text-xs">
              <option value="left">Body: Left</option><option value="center">Body: Center</option><option value="right">Body: Right</option>
            </select>
          </div>
        </div>
        <div><div className="text-xs text-slate-600 mb-1">Footer Template</div><div className="relative"><PanelBottom size={16} className="absolute left-2 top-3 text-emerald-700 pointer-events-none"/><textarea value={form.footer_template} onChange={(e)=>setField('footer_template',e.target.value)} placeholder="Supports {{vars}}" className="w-full border rounded px-7 py-2 text-sm min-h-20"/></div>
          <div className="mt-1">
            <select value={alignFooter} onChange={(e)=>setAlignFooter(e.target.value)} className="border rounded px-2 py-1 text-xs">
              <option value="left">Footer: Left</option><option value="center">Footer: Center</option><option value="right">Footer: Right</option>
            </select>
          </div>
        </div>
      </div>

      {/* Variables */}
      <div className="bg-slate-50 border rounded p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold"><Braces size={16} className="text-pink-600"/> Variables</div>
          <button onClick={()=>addVar()} className="px-2 py-1 rounded text-xs bg-green-600 text-white flex items-center gap-1"><Plus size={14}/> Add</button>
        </div>
        {(form.variables||[]).map((v,i)=>(
          <div key={`${v}-${i}`} className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input value={v} onChange={(e)=>updVar(i,e.target.value)} placeholder="variable_name" className="border rounded px-2 py-1 text-sm"/>
            <input value={sampleValues?.[v]??''} onChange={(e)=>setSampleValues((s)=>({...s,[v]:e.target.value}))} placeholder="sample value" className="border rounded px-2 py-1 text-sm"/>
            <div className="flex items-center"><button onClick={()=>delVar(i)} className="px-2 py-1 rounded text-xs bg-rose-600 text-white flex items-center gap-1"><Trash2 size={14}/> Remove</button></div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {form.id&&(<button onClick={()=>resetForm()} className="px-3 py-2 rounded bg-slate-200 text-sm flex items-center gap-2 ml-auto"><Plus size={16}/> New</button>)}
        <button onClick={()=>onSave()} disabled={saving} className="px-3 py-2 rounded bg-blue-600 text-white text-sm flex items-center gap-2 disabled:opacity-50"><Save size={16}/> {form.id?'Update':'Save'}</button>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={()=>setPreviewMode((m)=>m==='print'?'text':'print')} className="px-3 py-2 rounded bg-slate-100 text-sm flex items-center gap-2"><Eye size={16}/> {previewMode==='print'?'Text Preview':'Print Preview'}</button>
          <button onClick={printNow} className="px-3 py-2 rounded bg-emerald-600 text-white text-sm flex items-center gap-2"><Printer size={16}/> Print</button>
        </div>
      </div>

      {/* Preview + list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* PREVIEW */}
        <div className="border rounded p-3">
          <div className="text-sm font-semibold mb-2">🖨️ {previewMode==='print'?(theme==='compact'?'Print-like • Compact 50×25mm':'Print-like'):'Text Preview'}</div>
          {previewMode==='text'?(
            <pre className="whitespace-pre-wrap text-xs bg-white border rounded p-3">{composedText||'— Enter header/body/footer and variables —'}</pre>
          ):(
            <div ref={previewRef} className="flex justify-center relative">
              <div
                ref={labelBoxRef}
                style={{
                  width:`${dimW}mm`,height:`${dimH}mm`,boxShadow:'0 0 0 1px #e5e7eb inset',background:'white',
                  display:'grid',gridTemplateRows:'auto 1fr auto',gap:theme==='compact'?'1.2mm':'2mm',
                  padding:theme==='compact'?'2mm':'4mm',fontFamily:"ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,'Helvetica Neue',Arial",color:'#111827',position:'relative',
                  boxSizing:'border-box',overflow:'hidden'
                }}
              >
                {/* Header */}
                <div style={{border:'1px solid #e5e7eb',padding:theme==='compact'?'1.2mm':'2mm',fontSize:theme==='compact'?'2.8mm':'3.2mm',fontWeight:700,textAlign:alignHeader}}>
                  {layoutMode==='designed'?(renderTemplate(form.header_template,sampleValues)||sampleValues?.title||form.label_name||'Label'):renderTemplate(form.header_template,sampleValues)||'HEADER'}
                </div>

                {/* Body + resizer + codes */}
                <div style={{display:'flex',gap:theme==='compact'?'1mm':'2mm',position:'relative',alignItems:'stretch'}}>
                  {/* Left column */}
                  <div ref={bodyBoxRef} style={{border:'1px solid #e5e7eb',padding:theme==='compact'?'1.2mm':'2mm',fontSize:theme==='compact'?'2.6mm':'3mm',lineHeight:1.2,flex:1,minWidth:0,position:'relative',textAlign:alignBody}}>
                    {showSafeArea&&(<div style={{position:'absolute',inset:0,pointerEvents:'none',border:'1px dashed #94a3b8'}}/>)}
                    {showGridGuides&&isDragging&&(<div style={{position:'absolute',inset:0,pointerEvents:'none',backgroundImage:'linear-gradient(to right, rgba(148,163,184,0.35) 1px, transparent 1px)',backgroundSize:'8mm 100%'}}/>)}

                    {layoutMode==='designed'?(
                      <div style={{display:'grid',gridTemplateColumns:'24mm 1fr',rowGap:'0.6mm',columnGap:'1mm',alignItems:'start'}}>
                        {designedRows.map((r)=>(
                          <React.Fragment key={r.key}>
                            <div style={{opacity:.7,whiteSpace:'nowrap'}}>{r.label}</div>
                            <div style={{fontWeight:600,wordBreak:'break-word',whiteSpace:'pre-wrap'}}>{String(r.val)}</div>
                          </React.Fragment>
                        ))}
                      </div>
                    ):(
                      <div style={{whiteSpace:'pre-wrap'}}>{renderTemplate(form.body_template,sampleValues)||'BODY CONTENT'}</div>
                    )}

                    {/* DRAGGABLE codes — only when sidePane is OFF */}
                    {!sidePane && (
                      <>
                        {useQr?(
                          <div
                            onMouseDown={(e)=>dragStart('qr',e)}
                            title="Drag QR"
                            style={{
                              position:'absolute',
                              left:`${getPos('qr').x}mm`,
                              top:`${getPos('qr').y}mm`,
                              width:`${QR_SIZE_MM}mm`,
                              height:`${QR_SIZE_MM}mm`,
                              cursor:'move',
                              padding:'0.5mm',
                              boxShadow:isDragging&&dragging==='qr'?'0 0 0 1px #2563eb inset':'none',
                              background:'white'
                            }}
                          >
                            <QRSvg value={sampleValues?.qrcode||sampleValues?.barcode||form.label_id||'QR'} ec={qrEc} scale={theme==='compact'?2:3}/>
                          </div>
                        ):(
                          <div
                            onMouseDown={(e)=>dragStart('code',e)}
                            title="Drag Barcode"
                            style={{
                              position:'absolute',
                              left:`${getPos('code').x}mm`,
                              top:`${getPos('code').y}mm`,
                              width:`${barcodeWmm}mm`,
                              height:`${barcodeHmm}mm`,
                              cursor:'move',
                              padding:'0.5mm',
                              boxShadow:isDragging&&dragging==='code'?'0 0 0 1px #2563eb inset':'none',
                              background:'white',
                              display:'flex',flexDirection:'column',alignItems:'stretch',justifyContent:'center',gap:'0.5mm'
                            }}
                          >
                            {/* Bars fill container */}
                            <div style={{flex:'1 1 auto'}}>
                              <Code128Svg value={sampleValues?.barcode||form.label_id||'CODE128'} />
                            </div>
                            {/* Human text locked to fixed px size */}
                            {showHuman && (
                              <div style={{fontSize:10,lineHeight:'12px',textAlign:'center',fontFamily:'ui-monospace,monospace',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                                {sampleValues?.barcode||form.label_id||'CODE128'}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {warnOut&&(
                      <div className="absolute right-1 top-1 text-amber-700 bg-amber-100 border border-amber-200 rounded px-2 py-0.5 text-xs flex items-center gap-1">
                        <AlertTriangle size={14}/> Adjusted to safe area
                      </div>
                    )}
                  </div>

                  {/* Splitter & Right pane — only visible when sidePane = true */}
                  {sidePane&&(
                    <>
                      <div onMouseDown={startResize} title="Drag to resize code panel" style={{width:'3px',cursor:'col-resize',background:'#cbd5e1',borderRadius:'2px'}}/>
                      <div style={{border:'1px solid #e5e7eb',padding:theme==='compact'?'0.6mm':'1mm',display:'flex',alignItems:'center',justifyContent:'center',width:`${codePaneW}mm`}}>
                        {useQr
                          ? <QRSvg value={sampleValues?.qrcode||sampleValues?.barcode||form.label_id||'QR'} ec={qrEc} scale={theme==='compact'?2:3}/>
                          : (
                            <div style={{width:'100%'}}>
                              <div style={{width:'100%',height:`${barcodeHmm}mm`}}>
                                <Code128Svg value={sampleValues?.barcode||form.label_id||'CODE128'} />
                              </div>
                              {showHuman && (
                                <div style={{fontSize:10,lineHeight:'12px',textAlign:'center',fontFamily:'ui-monospace,monospace',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                                  {sampleValues?.barcode||form.label_id||'CODE128'}
                                </div>
                              )}
                            </div>
                          )
                        }
                      </div>
                    </>
                  )}
                </div>

                {/* Footer (inside the label grid) */}
                <div style={{border:'1px solid #e5e7eb',padding:theme==='compact'?'1.2mm':'2mm',fontSize:theme==='compact'?'2.4mm':'2.8mm',textAlign:alignFooter}}>
                  {layoutMode==='designed'?(sampleValues?.footer||renderTemplate(form.footer_template,sampleValues)||''):renderTemplate(form.footer_template,sampleValues)||'FOOTER'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* LIST */}
        <div className="border rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100"><tr><th className="text-left p-2">Label</th><th className="text-left p-2">Module</th><th className="text-left p-2">Plant</th><th className="text-left p-2">Status</th><th className="text-left p-2">Vars</th><th className="text-left p-2">Actions</th></tr></thead>
            <tbody>
              {listLoading?Array.from({length:6}).map((_,i)=>skel(i)):filtered.map((l)=>(
                <tr key={l.id} className="border-t">
                  <td className="p-2"><div className="font-mono">{l.label_id}</div><div className="text-xs text-slate-500">{l.label_name}</div></td>
                  <td className="p-2">{[l.module_id,l.submodule_id].filter(Boolean).join(' → ')}</td>
                  <td className="p-2">{plantMap[l.plant_uid]||'-'}</td>
                  <td className="p-2"><span className={cls('px-2 py-0.5 rounded-full border text-xs',badgeColor(l.status))}>{l.status||'-'}</span></td>
                  <td className="p-2">{Array.isArray(l.variables)?l.variables.join(', '):(l.variables?.variables||[]).join(', ')}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <button onClick={()=>onEdit(l)} className="px-2 py-1 rounded bg-amber-200 text-amber-900 flex items-center gap-1 text-xs"><Edit3 size={14}/> Edit</button>
                      <button onClick={()=>onDelete(l.id)} className="px-2 py-1 rounded bg-rose-200 text-rose-900 flex items-center gap-1 text-xs"><Trash2 size={14}/> Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!listLoading&&filtered.length===0&&(<tr><td className="p-4 text-center text-slate-500" colSpan={6}>No labels found</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LabelMaster;
