import { useState, useMemo, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from "recharts";

const SHEET_ID  = "18giFVrZifBJzzsoX1LfuCnXXqm41dNgrogPehvJkFSA";
const SHEET_GID = "2131982147";
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/pub?gid=${SHEET_GID}&single=true&output=csv`;

const TODAY = new Date();

// ── CSV / sheet parsing ───────────────────────────────────────────────────────

function parseCSV(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const row = [];
    let inQ = false, cell = "";
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (inQ && line[i+1] === '"') { cell += '"'; i++; } else inQ = !inQ; }
      else if (c === "," && !inQ) { row.push(cell.trim()); cell = ""; }
      else cell += c;
    }
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

const STATE_NORM = {
  "andhra pradesh":"Andhra Pradesh","assam":"Assam","chandigarh":"Chandigarh",
  "gujarat":"Gujarat","karnataka":"Karnataka","kerala":"Kerala",
  "madhya pradesh":"Madhya Pradesh","maharashtra":"Maharashtra","tamil nadu":"Tamil Nadu",
  "telangana":"Telangana","delhi":"Delhi","uttar pradesh":"Uttar Pradesh","puducherry":"Puducherry",
};
function normState(s){ return STATE_NORM[s?.trim().toLowerCase()] ?? s?.trim() ?? ""; }

function parseDate(s) {
  if (!s) return null;
  s = s.trim();
  const m1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,"0")}-${m1[1].padStart(2,"0")}`;
  const MONTHS = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  const m2 = s.match(/^(\d{1,2})[\/\-\s]([A-Za-z]+)[\/\-\s](\d{4})$/);
  if (m2) { const mo = MONTHS[m2[2].toLowerCase().slice(0,3)]; if (mo) return `${m2[3]}-${String(mo).padStart(2,"0")}-${m2[1].padStart(2,"0")}`; }
  return null;
}

function parseAmount(s) {
  if (!s) return null;
  s = s.trim();
  const parts = s.match(/\d\)\s*([\d,]+)/g);
  if (parts) return parts.reduce((sum,p)=>{ const n=p.match(/([\d,]+)/); return sum+parseInt(n[1].replace(/,/g,""),10); },0);
  const n = parseInt(s.replace(/,/g,"").replace(/[^\d]/g,""), 10);
  return isNaN(n)||n===0 ? null : n;
}

function parseUnits(s) {
  if (!s) return null;
  const n = parseInt(s.replace(/,/g,""), 10);
  return isNaN(n)||n===0 ? null : n;
}

function payStatus(remarks) {
  if (!remarks) return "Pending";
  const r = remarks.trim().toLowerCase();
  if (r === "p" || r === "pd") return "Paid";
  if (r.includes("done")) return "Paid";
  if (r.includes("ecs")) return "Paid";
  if (r.includes("epi")) return "Paid";
  return "Pending";
}

function mapRow(row) {
  const [stateRaw, storeRaw, respRaw, dueDateRaw, unitsRaw, invoiceLinkRaw, amountRaw, remarksRaw] = row;
  const state = normState(stateRaw);
  const store = storeRaw?.replace(/\t/g,"").trim() ?? "";
  if (!state || !store) return null;
  const invoiceLink = invoiceLinkRaw?.trim() ?? "";
  const has_invoice = invoiceLink.startsWith("http");
  return {
    state,
    store,
    responsible: respRaw?.trim() ?? "",
    due_date: parseDate(dueDateRaw),
    units: parseUnits(unitsRaw),
    amount: parseAmount(amountRaw),
    has_invoice,
    invoice_link: has_invoice ? invoiceLink : null,
    pay_status: payStatus(remarksRaw),
    remarks: remarksRaw?.trim() ?? "",
  };
}

// ── Static historical data ────────────────────────────────────────────────────

const APR = {
  "RJM - DANVAIPETA":{units:7493,amount:82554},"GTR - LAXMIPURAM":{units:5353,amount:58746},
  "TRP - AIR ROAD":{units:5288,amount:60960},"VJN - SRINIVASA NAGAR":{units:5429,amount:57436},
  "KKN - RAMA KRISHNARAO PET":{units:5613,amount:61018},"NLR - MINI BYPASS ROAD":{units:4438,amount:44301},
  "VJW - M G ROAD":{units:5864,amount:81107},"VIG - MADHURWADA":{units:7035,amount:75272},
  "BLR - MALLESWARAM":{units:3680,amount:36393},"BLR - INDIRANAGAR":{units:3900,amount:38393},
  "BLR - ARS COMPLEX MALLESHWARAM":{units:2703,amount:24532},"UDP - MAIN MARKET":{units:4774,amount:39628},
  "MGL - BALMATTA":{units:1762,amount:19539},"MGL-NEXUS FIZA MALL":{units:1842,amount:21671},
  "BLR - HSR LAYOUT":{units:8018,amount:41573},"KCH - LULU MALL":{units:2573,amount:29007},
  "IDR - SNEH NAGAR":{units:3229,amount:29152},"PUN - PHOENIX MALL VIMAN NAGAR":{units:2103,amount:28410},
  "PUNMLM - MALL OF THE MILLENNIUM":{units:3456,amount:46450},"PUN - WESTEND MALL":{units:1959,amount:26920},
  "PUN - SOLITAIRE BUSINESS HUB":{units:11402,amount:225170},"CBT - RS PURAM":{units:9769,amount:120791},
  "CHN - T NAGAR":{units:6800,amount:84725},"HYD - DSL VIRTUE MALL":{units:3227,amount:46875},
  "HYD - JUBILEE HILLS":{units:5498,amount:65878},"HYD - VANATSALIPURAM":{units:3728,amount:45765},
  "KHM - WYRA ROAD":{units:8625,amount:98188},"NALAGANDLA":{units:3718,amount:34246},
  "Kokapet":{units:1471,amount:19771},"NZM - PRAGATHI NAGAR":{units:4964,amount:57472},
  "WRL - NAIM NAGAR":{units:6283,amount:71613},"KAMALANAGAR":{units:3200,amount:45000},
};

const TREND = [
  {month:"Oct-25",uploaded:38,paid:32,units:142000,amount:1820000},
  {month:"Nov-25",uploaded:41,paid:35,units:149000,amount:1940000},
  {month:"Dec-25",uploaded:39,paid:33,units:138000,amount:1780000},
  {month:"Jan-26",uploaded:44,paid:38,units:151000,amount:1990000},
  {month:"Feb-26",uploaded:47,paid:41,units:155000,amount:2050000},
  {month:"Mar-26",uploaded:49,paid:43,units:162000,amount:2140000},
  {month:"Apr-26",uploaded:52,paid:46,units:168000,amount:2230000},
  {month:"May-26",uploaded:58,paid:51,units:178000,amount:2380000},
];

const STATE_CLR = {
  "Andhra Pradesh":"#378ADD","Karnataka":"#1D9E75","Kerala":"#D4537E","Tamil Nadu":"#BA7517",
  "Telangana":"#7F77DD","Maharashtra":"#D85A30","Madhya Pradesh":"#639922","Delhi":"#888780",
  "Assam":"#63340A","Puducherry":"#993556","Gujarat":"#E89B20","Chandigarh":"#4AABDB",
  "Uttar Pradesh":"#A060C8",
};

const URGENCY = {
  overdue: {label:"Overdue",        color:"#A32D2D",bg:"#FCEBEB",border:"#F09595",icon:"🔴",p:0},
  today:   {label:"Due Today",      color:"#7B1818",bg:"#FCE4E4",border:"#EB8585",icon:"🚨",p:1},
  critical:{label:"Due in 1–2 Days",color:"#D85A30",bg:"#FDF0E8",border:"#F5B47A",icon:"🟠",p:2},
  warning: {label:"Due in 3–5 Days",color:"#BA7517",bg:"#FEF7E8",border:"#F5D27A",icon:"🟡",p:3},
  upcoming:{label:"Due in 6–10 Days",color:"#3A6012",bg:"#EEF7E5",border:"#A3D46A",icon:"🟢",p:4},
};

const TABS = ["Overview","Due Alerts","Tracker","Payments","MoM","High Bills","🔔 Reminders"];

// ── helpers ───────────────────────────────────────────────────────────────────
function days(due){if(!due)return null;return Math.ceil((new Date(due)-TODAY)/86400000);}
function urgencyOf(s){const d=days(s.due_date);if(s.pay_status==="Paid")return null;if(d===null)return null;if(d<0)return"overdue";if(d===0)return"today";if(d<=2)return"critical";if(d<=5)return"warning";if(d<=10)return"upcoming";return null;}
function fA(n){return n==null?"—":"₹"+n.toLocaleString("en-IN");}
function fN(n){return n==null?"—":n.toLocaleString("en-IN");}

function downloadCSV(filename,headers,rows){
  const esc=v=>{const s=v==null?"":String(v);return s.includes(",")||s.includes('"')||s.includes("\n")?`"${s.replace(/"/g,'""')}"`  :s;};
  const csv=[headers,...rows].map(r=>r.map(esc).join(",")).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=filename;a.click();
}

function Card({label,value,sub,color}){
  return <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"0.8rem 1rem"}}>
    <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>{label}</div>
    <div style={{fontSize:22,fontWeight:500,color:color||"var(--color-text-primary)",lineHeight:1.1}}>{value}</div>
    {sub&&<div style={{fontSize:10,color:"var(--color-text-tertiary)",marginTop:2}}>{sub}</div>}
  </div>;
}
function Tag({t,v}){
  const m={paid:{bg:"#EAF3DE",c:"#3B6D11"},pending:{bg:"#FAEEDA",c:"#854F0B"},overdue:{bg:"#FCEBEB",c:"#A32D2D"},upload:{bg:"#E6F1FB",c:"#185FA5"},miss:{bg:"#F1EFE8",c:"#5F5E5A"}};
  const s=m[t]||m.miss;
  return <span style={{background:s.bg,color:s.c,fontSize:11,padding:"2px 7px",borderRadius:10,fontWeight:500,whiteSpace:"nowrap"}}>{v}</span>;
}
function TH({children,right}){return <th style={{textAlign:right?"right":"left",fontWeight:500,fontSize:10,color:"var(--color-text-secondary)",padding:"5px 8px",borderBottom:"0.5px solid var(--color-border-tertiary)",textTransform:"uppercase",letterSpacing:".04em",whiteSpace:"nowrap"}}>{children}</th>;}
function TD({children,right,style={}}){return <td style={{padding:"6px 8px",borderBottom:"0.5px solid var(--color-border-tertiary)",textAlign:right?"right":"left",...style}}>{children}</td>;}

async function apiMsg(store,type){
  const d=days(store.due_date);
  const dueStr=store.due_date?new Date(store.due_date).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}):"soon";
  const overdue=d!==null&&d<0?Math.abs(d):0;
  const prompt=`You are writing a professional ${type==="whatsapp"?"WhatsApp":"email"} reminder from Kushals jewellery head office.
Store: ${store.store} (${store.state}) | Responsible: ${store.responsible} | Due: ${dueStr}
${overdue>0?"OVERDUE by "+overdue+" days — electricity disconnection risk.":"Days left: "+(d??"")}
Invoice uploaded: ${store.has_invoice?"Yes":"No — must be uploaded NOW"}
Amount: ${store.amount?"₹"+store.amount.toLocaleString("en-IN"):"not entered"} | Units: ${store.units?store.units+" kWh":"not entered"}
Write a short ${type==="whatsapp"?"WhatsApp message (emojis ok, under 100 words)":"email body (professional, under 120 words)"} asking them to ${!store.has_invoice?"upload invoice and":"confirm"} complete payment. Output message text only.`;
  const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:300,messages:[{role:"user",content:prompt}]})});
  const data=await res.json();
  return data.content?.[0]?.text||"Could not generate message.";
}

async function sendEmail(to,subject,body){
  const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:200,messages:[{role:"user",content:`Send email to ${to}, subject: "${subject}", body: ${body}`}],mcp_servers:[{type:"url",url:"https://gmailmcp.googleapis.com/mcp/v1",name:"gmail"}]})});
  const data=await res.json();
  const tool=data.content?.find(b=>b.type==="mcp_tool_result");
  const txt=data.content?.find(b=>b.type==="text");
  return{success:!!(tool||(txt?.text?.toLowerCase().includes("sent")))};
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function App(){
  const [stores,setStores]=useState([]);
  const [loading,setLoading]=useState(true);
  const [syncErr,setSyncErr]=useState(null);
  const [lastSync,setLastSync]=useState(null);

  const [tab,setTab]=useState(0);
  const [stateF,setStateF]=useState("All");
  const [respF,setRespF]=useState("All");

  const [contacts,setContacts]=useState({CHETHAN:"",THARUN:""});
  const [waNum,setWaNum]=useState({CHETHAN:"",THARUN:""});
  const [msgType,setMsgType]=useState("whatsapp");
  const [msgCache,setMsgCache]=useState({});
  const [sending,setSending]=useState({});
  const [sent,setSent]=useState({});
  const [selected,setSelected]=useState({});
  const [expanded,setExpanded]=useState(null);
  const [copied,setCopied]=useState({});
  const [batchBusy,setBatchBusy]=useState(false);
  const [batchRes,setBatchRes]=useState(null);
  const [settingsOpen,setSettingsOpen]=useState(false);

  const loadSheet = useCallback(async () => {
    setLoading(true); setSyncErr(null);
    try {
      const res = await fetch(SHEET_CSV_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status} — sheet may not be published yet`);
      const text = await res.text();
      const rows = parseCSV(text);
      const data = rows.slice(1).map(mapRow).filter(Boolean).filter(s=>s.store);
      setStores(data);
      setLastSync(new Date());
    } catch(e) {
      setSyncErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSheet(); }, [loadSheet]);

  const states=useMemo(()=>["All",...new Set(stores.map(s=>s.state))].sort(),[stores]);
  const filtered=useMemo(()=>stores.filter(s=>(stateF==="All"||s.state===stateF)&&(respF==="All"||s.responsible===respF)),[stateF,respF,stores]);

  const total=stores.length,
        uploaded=stores.filter(s=>s.has_invoice).length,
        paid=stores.filter(s=>s.pay_status==="Paid").length,
        pending=stores.filter(s=>s.pay_status==="Pending").length,
        overdue=stores.filter(s=>{const d=days(s.due_date);return d!==null&&d<0&&s.pay_status==="Pending";}).length,
        totalAmt=stores.filter(s=>s.amount).reduce((a,s)=>a+s.amount,0);
  const alertCount=stores.filter(s=>{const d=days(s.due_date);return d!==null&&d>=0&&d<=5&&s.pay_status==="Pending";}).length;

  const byState=useMemo(()=>{
    const m={};
    stores.forEach(s=>{if(!m[s.state])m[s.state]={state:s.state,total:0,uploaded:0,paid:0,units:0,amount:0};
      m[s.state].total++;if(s.has_invoice)m[s.state].uploaded++;if(s.pay_status==="Paid")m[s.state].paid++;
      if(s.units)m[s.state].units+=s.units;if(s.amount)m[s.state].amount+=s.amount;});
    return Object.values(m).sort((a,b)=>b.amount-a.amount);
  },[stores]);

  const momData=useMemo(()=>stores.filter(s=>s.units&&APR[s.store]).map(s=>({
    store:s.store.length>20?s.store.slice(0,18)+"…":s.store,full:s.store,state:s.state,
    may:s.units,apr:APR[s.store].units,mayA:s.amount||0,aprA:APR[s.store].amount||0,
    chg:s.units-APR[s.store].units,pct:Math.round(((s.units-APR[s.store].units)/APR[s.store].units)*100),
  })).sort((a,b)=>b.pct-a.pct),[stores]);

  const perUnit=useMemo(()=>stores.filter(s=>s.units>100&&s.amount).map(s=>({...s,pu:Math.round(s.amount/s.units)})).sort((a,b)=>b.pu-a.pu),[stores]);
  const avgPU=perUnit.length?Math.round(perUnit.reduce((a,s)=>a+s.pu,0)/perUnit.length):0;
  const highThr=avgPU*1.3;

  const pieData=[
    {name:"Uploaded & Paid",value:stores.filter(s=>s.has_invoice&&s.pay_status==="Paid").length,color:"#1D9E75"},
    {name:"Uploaded, Pending",value:stores.filter(s=>s.has_invoice&&s.pay_status==="Pending").length,color:"#BA7517"},
    {name:"No Invoice, Paid",value:stores.filter(s=>!s.has_invoice&&s.pay_status==="Paid").length,color:"#378ADD"},
    {name:"No Invoice, Pending",value:stores.filter(s=>!s.has_invoice&&s.pay_status==="Pending").length,color:"#E24B4A"},
  ];

  const needsReminder=useMemo(()=>stores.map(s=>({...s,urgency:urgencyOf(s),d:days(s.due_date)})).filter(s=>s.urgency).sort((a,b)=>{const pa=URGENCY[a.urgency]?.p??99,pb=URGENCY[b.urgency]?.p??99;return pa-pb||(a.d??99)-(b.d??99);}),[stores]);
  const grouped=useMemo(()=>{const g={};needsReminder.forEach(s=>{if(!g[s.urgency])g[s.urgency]=[];g[s.urgency].push(s);});return g;},[needsReminder]);
  const selCount=Object.values(selected).filter(Boolean).length;

  async function loadMsg(store){
    const key=store.store+msgType;
    if(msgCache[key])return;
    setMsgCache(p=>({...p,[key]:"loading"}));
    const m=await apiMsg(store,msgType);
    setMsgCache(p=>({...p,[key]:m}));
  }
  async function toggleExpand(store){
    if(expanded===store.store){setExpanded(null);return;}
    setExpanded(store.store);loadMsg(store);
  }
  async function handleSend(store){
    const email=contacts[store.responsible];
    if(!email){alert(`Add ${store.responsible}'s email in Settings.`);return;}
    const key=store.store,mk=store.store+"email";
    let msg=msgCache[mk];
    if(!msg||msg==="loading"){msg=await apiMsg(store,"email");setMsgCache(p=>({...p,[mk]:msg}));}
    setSending(p=>({...p,[key]:true}));
    const dueStr=store.due_date?new Date(store.due_date).toLocaleDateString("en-IN",{day:"numeric",month:"short"}):"soon";
    const res=await sendEmail(email,`[Kushals] EB Reminder – ${store.store} (Due ${dueStr})`,msg);
    setSending(p=>({...p,[key]:false}));setSent(p=>({...p,[key]:res.success?"sent":"failed"}));
  }
  async function batchSend(){
    const sel=needsReminder.filter(s=>selected[s.store]);
    if(!sel.length){alert("Select stores first.");return;}
    const miss=[...new Set(sel.map(s=>s.responsible))].filter(r=>!contacts[r]);
    if(miss.length){alert(`Add email for: ${miss.join(", ")} in Settings.`);return;}
    setBatchBusy(true);let ok=0,fail=0;
    for(const store of sel){
      const mk=store.store+"email";
      let msg=msgCache[mk];
      if(!msg||msg==="loading"){msg=await apiMsg(store,"email");setMsgCache(p=>({...p,[mk]:msg}));}
      const dueStr=store.due_date?new Date(store.due_date).toLocaleDateString("en-IN",{day:"numeric",month:"short"}):"soon";
      const res=await sendEmail(contacts[store.responsible],`[Kushals] EB Reminder – ${store.store} (Due ${dueStr})`,msg);
      setSent(p=>({...p,[store.store]:res.success?"sent":"failed"}));
      if(res.success)ok++;else fail++;
    }
    setBatchBusy(false);setBatchRes({ok,fail});
  }
  function selAll(urg){
    const stores=grouped[urg]||[];const allSel=stores.every(s=>selected[s.store]);
    const u={...selected};stores.forEach(s=>{u[s.store]=!allSel;});setSelected(u);
  }
  function copyMsg(key,text){
    navigator.clipboard.writeText(text).then(()=>{setCopied(p=>({...p,[key]:true}));setTimeout(()=>setCopied(p=>({...p,[key]:false})),2000);});
  }

  function TabLabel({i,label}){
    const badge=i===6?needsReminder.length:i===1?alertCount:0;
    return <button onClick={()=>setTab(i)} style={{padding:"7px 11px",fontSize:12,fontWeight:tab===i?500:400,background:"transparent",border:"none",cursor:"pointer",color:tab===i?"var(--color-text-primary)":"var(--color-text-secondary)",borderBottom:tab===i?"2px solid var(--color-text-primary)":"2px solid transparent",marginBottom:-1,whiteSpace:"nowrap",position:"relative"}}>
      {label}
      {badge>0&&<span style={{position:"absolute",top:4,right:2,background:i===6?"#E24B4A":"#D85A30",color:"#fff",fontSize:9,borderRadius:8,padding:"1px 4px",fontWeight:600,lineHeight:1.4}}>{badge}</span>}
    </button>;
  }

  return (
    <div style={{fontFamily:"var(--font-sans)",padding:"0.5rem 0",maxWidth:960}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"1rem",flexWrap:"wrap",gap:8}}>
        <div>
          <h1 style={{fontSize:19,fontWeight:500,margin:"0 0 3px"}}>Electricity Bill Control</h1>
          <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>
            {total} stores · May 2026
            {lastSync&&<span style={{marginLeft:8,color:"var(--color-text-tertiary)"}}>· synced {lastSync.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <a href={`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SHEET_GID}`} target="_blank" rel="noreferrer"
            style={{fontSize:11,padding:"5px 10px",borderRadius:"var(--border-radius-md)",border:"0.5px solid var(--color-border-secondary)",background:"var(--color-background-secondary)",color:"var(--color-text-secondary)",textDecoration:"none",display:"flex",alignItems:"center",gap:4}}>
            📊 Open Sheet
          </a>
          <button onClick={loadSheet} disabled={loading} style={{fontSize:11,padding:"5px 10px",borderRadius:"var(--border-radius-md)",border:"0.5px solid var(--color-border-secondary)",background:"var(--color-background-secondary)",color:"var(--color-text-secondary)",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
            <span style={loading?{display:"inline-block",animation:"spin .8s linear infinite"}:{}}>{loading?"⟳":"↻"}</span>
            {loading?"Syncing…":"Sync"}
          </button>
        </div>
      </div>

      {/* Sync error banner */}
      {syncErr&&<div style={{background:"#FCEBEB",border:"0.5px solid #F09595",borderRadius:"var(--border-radius-md)",padding:"10px 14px",marginBottom:"1rem",fontSize:12}}>
        <div style={{color:"#A32D2D",fontWeight:500,marginBottom:4}}>⚠ Could not load sheet data: {syncErr}</div>
        <div style={{color:"#791F1F",lineHeight:1.6}}>
          To connect your Google Sheet, go to <strong>File → Share → Publish to web</strong> in the spreadsheet, select the sheet tab, choose <strong>CSV</strong> format, and click <strong>Publish</strong>.
          Then click <strong>Sync</strong> above.
        </div>
      </div>}

      {/* Loading skeleton */}
      {loading&&stores.length===0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8,marginBottom:"1.25rem"}}>
        {[...Array(6)].map((_,i)=><div key={i} style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"0.8rem 1rem",height:68,opacity:0.5}}/>)}
      </div>}

      {stores.length>0&&<>
        {/* Metric strip */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8,marginBottom:"1.25rem"}}>
          <Card label="Total Stores" value={total}/>
          <Card label="Invoice Uploaded" value={uploaded} sub={Math.round(uploaded/total*100)+"% compliance"} color="#185FA5"/>
          <Card label="Payments Done" value={paid} sub={Math.round(paid/total*100)+"% of stores"} color="#3B6D11"/>
          <Card label="Pending" value={pending} color="#854F0B"/>
          <Card label="Overdue" value={overdue} color="#A32D2D"/>
          <Card label="Total Amount" value={"₹"+(totalAmt/100000).toFixed(1)+"L"} sub="May 2026"/>
        </div>

        {/* Filters */}
        <div style={{display:"flex",gap:8,marginBottom:"0.9rem",flexWrap:"wrap",alignItems:"center"}}>
          <select value={stateF} onChange={e=>setStateF(e.target.value)} style={{fontSize:12,padding:"4px 8px"}}>
            {states.map(s=><option key={s}>{s}</option>)}
          </select>
          <select value={respF} onChange={e=>setRespF(e.target.value)} style={{fontSize:12,padding:"4px 8px"}}>
            {["All","CHETHAN","THARUN"].map(s=><option key={s}>{s}</option>)}
          </select>
          {(stateF!=="All"||respF!=="All")&&<button onClick={()=>{setStateF("All");setRespF("All");}} style={{fontSize:11,padding:"4px 8px"}}>✕ Clear</button>}
          <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>{filtered.length} stores</span>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:0,marginBottom:"1.25rem",borderBottom:"0.5px solid var(--color-border-tertiary)",overflowX:"auto"}}>
          {TABS.map((t,i)=><TabLabel key={t} i={i} label={t}/>)}
        </div>

        {/* ── Tab 0: Overview ────────────────────────── */}
        {tab===0&&<div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem",marginBottom:"1.5rem"}}>
            <div>
              <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:6,textTransform:"uppercase",letterSpacing:".04em"}}>Monthly Upload & Payment Trend</div>
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={TREND} barSize={7}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis dataKey="month" tick={{fontSize:9}}/><YAxis tick={{fontSize:9}}/>
                  <Tooltip contentStyle={{fontSize:10}}/>
                  <Bar dataKey="uploaded" fill="#378ADD" name="Uploaded" radius={[2,2,0,0]}/>
                  <Bar dataKey="paid" fill="#1D9E75" name="Paid" radius={[2,2,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:6,textTransform:"uppercase",letterSpacing:".04em"}}>May 2026 Status</div>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={65} dataKey="value" paddingAngle={2}>
                    {pieData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                  </Pie>
                  <Tooltip contentStyle={{fontSize:10}} formatter={v=>[v+" stores"]}/>
                  <Legend iconType="square" iconSize={8} wrapperStyle={{fontSize:10}}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".04em"}}>State-wise Summary</div>
            <button onClick={()=>downloadCSV("state-summary.csv",["State","Stores","Uploaded","Upload %","Paid","Amount"],byState.map(s=>[s.state,s.total,s.uploaded,Math.round(s.uploaded/s.total*100)+"%",s.paid,s.amount||""]))} style={{fontSize:11,padding:"3px 9px",background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--border-radius-md)",cursor:"pointer",color:"var(--color-text-secondary)"}}>↓ CSV</button>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr>{["State","Stores","Uploaded","Upload %","Paid","Amount"].map(h=><TH key={h} right={!["State"].includes(h)}>{h}</TH>)}</tr></thead>
              <tbody>{byState.map(s=>(
                <tr key={s.state} style={{cursor:"pointer"}} onClick={()=>{setStateF(s.state);setTab(2);}}>
                  <TD><span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:STATE_CLR[s.state]||"#888",marginRight:6}}/>{s.state}</TD>
                  <TD right>{s.total}</TD><TD right>{s.uploaded}</TD>
                  <TD right style={{color:s.uploaded/s.total>=0.8?"#3B6D11":"#854F0B"}}>{Math.round(s.uploaded/s.total*100)}%</TD>
                  <TD right>{s.paid}</TD><TD right>{fA(s.amount||null)}</TD>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>}

        {/* ── Tab 1: Due Alerts ──────────────────────── */}
        {tab===1&&<div>
          {alertCount>0&&<div style={{background:"#FCEBEB",border:"0.5px solid #F09595",borderRadius:"var(--border-radius-md)",padding:"9px 14px",marginBottom:"1rem",fontSize:12}}>
            <span style={{color:"#A32D2D",fontWeight:500}}>⚠ {alertCount} stores</span><span style={{color:"#791F1F"}}> have payment due within 5 days and are still pending</span>
          </div>}
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:6}}>
            <button onClick={()=>{const rows=filtered.filter(s=>s.due_date).sort((a,b)=>new Date(a.due_date)-new Date(b.due_date)).map(s=>{const d=days(s.due_date);return[s.state,s.store,s.responsible,s.due_date,d<0?`${Math.abs(d)}d overdue`:d===0?"Today":`${d} days`,s.has_invoice?"Uploaded":"Missing",s.pay_status];});downloadCSV("due-alerts.csv",["State","Store","Responsible","Due Date","Days Left","Invoice","Payment"],rows);}} style={{fontSize:11,padding:"3px 9px",background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--border-radius-md)",cursor:"pointer",color:"var(--color-text-secondary)"}}>↓ CSV</button>
          </div>
          <div style={{overflowX:"auto",marginBottom:"1.5rem"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr>{["State","Store","Responsible","Due Date","Days Left","Invoice","Payment"].map(h=><TH key={h}>{h}</TH>)}</tr></thead>
              <tbody>{filtered.filter(s=>s.due_date).sort((a,b)=>new Date(a.due_date)-new Date(b.due_date)).map((s,i)=>{
                const d=days(s.due_date),isAlert=d!==null&&d>=0&&d<=5&&s.pay_status==="Pending",isOD=d!==null&&d<0&&s.pay_status==="Pending";
                return <tr key={i} style={{background:isAlert?"#FFF8F0":isOD?"#FFF0F0":"transparent"}}>
                  <TD style={{fontSize:11,color:"var(--color-text-secondary)"}}>{s.state}</TD>
                  <TD style={{fontWeight:isAlert||isOD?500:400}}>{s.store}</TD>
                  <TD style={{fontSize:11}}>{s.responsible}</TD>
                  <TD style={{whiteSpace:"nowrap"}}>{new Date(s.due_date).toLocaleDateString("en-IN")}</TD>
                  <TD style={{fontWeight:500,color:d<0?"#A32D2D":d<=3?"#D85A30":d<=5?"#BA7517":"#3B6D11"}}>
                    {d<0?`${Math.abs(d)}d overdue`:d===0?"Today":`${d} days`}
                  </TD>
                  <TD><Tag t={s.has_invoice?"upload":"miss"} v={s.has_invoice?"✓ Uploaded":"Missing"}/></TD>
                  <TD><Tag t={s.pay_status==="Paid"?"paid":isOD?"overdue":"pending"} v={s.pay_status}/></TD>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:6,textTransform:"uppercase",letterSpacing:".04em"}}>No Due Date Entered</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {filtered.filter(s=>!s.due_date).map((s,i)=><span key={i} style={{background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-md)",padding:"3px 10px",fontSize:11,color:"var(--color-text-secondary)"}}>{s.store} <span style={{color:"var(--color-text-tertiary)"}}>({s.state})</span></span>)}
          </div>
        </div>}

        {/* ── Tab 2: Tracker ─────────────────────────── */}
        {tab===2&&<div>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:6}}>
            <button onClick={()=>downloadCSV("tracker.csv",["State","Store","Responsible","Due Date","Units","Amount","Invoice","Payment","Remarks"],filtered.map(s=>[s.state,s.store,s.responsible,s.due_date||"",s.units||"",s.amount||"",s.has_invoice?"Uploaded":"Missing",s.pay_status,s.remarks||""]))} style={{fontSize:11,padding:"3px 9px",background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--border-radius-md)",cursor:"pointer",color:"var(--color-text-secondary)"}}>↓ CSV</button>
          </div>
          <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr>{["State","Store","Responsible","Due Date","Units","Amount","Invoice","Payment","Remarks"].map(h=><TH key={h} right={["Units","Amount"].includes(h)}>{h}</TH>)}</tr></thead>
            <tbody>{filtered.map((s,i)=>(
              <tr key={i}>
                <TD style={{fontSize:11,color:"var(--color-text-secondary)"}}>{s.state}</TD>
                <TD style={{fontWeight:500,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.store}</TD>
                <TD style={{fontSize:11}}>{s.responsible}</TD>
                <TD style={{whiteSpace:"nowrap",fontSize:11}}>{s.due_date?new Date(s.due_date).toLocaleDateString("en-IN"):"—"}</TD>
                <TD right>{fN(s.units)}</TD>
                <TD right>{fA(s.amount)}</TD>
                <TD>
                  {s.invoice_link
                    ? <a href={s.invoice_link} target="_blank" rel="noreferrer" style={{color:"#185FA5",fontSize:11,textDecoration:"none"}}>↗ View</a>
                    : <Tag t="miss" v="Missing"/>}
                </TD>
                <TD><Tag t={s.pay_status==="Paid"?"paid":"pending"} v={s.pay_status}/></TD>
                <TD style={{fontSize:10,color:"var(--color-text-tertiary)",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.remarks||""}</TD>
              </tr>
            ))}</tbody>
          </table>
          </div>
        </div>}

        {/* ── Tab 3: Payments ────────────────────────── */}
        {tab===3&&<div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem",marginBottom:"1.5rem"}}>
            <div>
              <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:6,textTransform:"uppercase",letterSpacing:".04em"}}>Paid vs Pending by State</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byState.slice(0,8)} layout="vertical" barSize={9}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false}/>
                  <XAxis type="number" tick={{fontSize:9}}/><YAxis type="category" dataKey="state" tick={{fontSize:9}} width={78}/>
                  <Tooltip contentStyle={{fontSize:10}}/>
                  <Bar dataKey="paid" fill="#1D9E75" name="Paid" radius={[0,2,2,0]}/>
                  <Bar dataKey="total" fill="#E24B4A" name="Total" radius={[0,2,2,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:6,textTransform:"uppercase",letterSpacing:".04em"}}>Pending Payments</div>
              <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:210,overflowY:"auto"}}>
                {filtered.filter(s=>s.pay_status==="Pending").map((s,i)=>{
                  const d=days(s.due_date);
                  return <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:d!==null&&d<0?"#FFF0F0":"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",fontSize:12}}>
                    <div><div style={{fontWeight:500}}>{s.store}</div><div style={{fontSize:10,color:"var(--color-text-tertiary)"}}>{s.state} · {s.responsible}</div></div>
                    <div style={{textAlign:"right"}}>
                      {s.amount&&<div style={{fontWeight:500,color:"#854F0B"}}>{fA(s.amount)}</div>}
                      {d!==null&&<div style={{fontSize:10,color:d<0?"#A32D2D":"#854F0B"}}>{d<0?`${Math.abs(d)}d overdue`:`Due in ${d}d`}</div>}
                    </div>
                  </div>;
                })}
              </div>
            </div>
          </div>
        </div>}

        {/* ── Tab 4: MoM ─────────────────────────────── */}
        {tab===4&&<div>
          <div style={{marginBottom:"1.5rem"}}>
            <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:6,textTransform:"uppercase",letterSpacing:".04em"}}>Total Monthly Bill Trend</div>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={TREND}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} tickFormatter={v=>"₹"+(v/100000).toFixed(1)+"L"}/>
                <Tooltip contentStyle={{fontSize:10}} formatter={v=>["₹"+(v/100000).toFixed(2)+"L"]}/>
                <Line type="monotone" dataKey="amount" stroke="#1D9E75" strokeWidth={2} dot={{r:3}} name="Total Amount"/>
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".04em"}}>May vs April — Store-wise</div>
            <button onClick={()=>downloadCSV("mom-comparison.csv",["Store","State","Apr Units","May Units","Change","% Change","Apr Amount","May Amount"],momData.map(s=>[s.full,s.state,s.apr,s.may,s.chg,s.pct+"%",s.aprA||"",s.mayA||""]))} style={{fontSize:11,padding:"3px 9px",background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--border-radius-md)",cursor:"pointer",color:"var(--color-text-secondary)"}}>↓ CSV</button>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr>{["Store","State","Apr Units","May Units","Change","% Chg","Apr Amt","May Amt"].map(h=><TH key={h} right={!["Store","State"].includes(h)}>{h}</TH>)}</tr></thead>
              <tbody>{momData.map((s,i)=>(
                <tr key={i}>
                  <TD style={{fontWeight:500,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.store}</TD>
                  <TD style={{fontSize:11,color:"var(--color-text-secondary)"}}>{s.state}</TD>
                  <TD right>{fN(s.apr)}</TD><TD right style={{fontWeight:500}}>{fN(s.may)}</TD>
                  <TD right style={{color:s.chg>0?"#A32D2D":"#3B6D11"}}>{s.chg>0?"+":""}{fN(s.chg)}</TD>
                  <TD right><span style={{background:s.pct>10?"#FCEBEB":s.pct<-10?"#EAF3DE":"var(--color-background-secondary)",color:s.pct>10?"#A32D2D":s.pct<-10?"#3B6D11":"var(--color-text-secondary)",padding:"1px 6px",borderRadius:8,fontSize:11}}>{s.pct>0?"+":""}{s.pct}%</span></TD>
                  <TD right style={{fontSize:11}}>{fA(s.aprA||null)}</TD>
                  <TD right style={{fontSize:11}}>{fA(s.mayA||null)}</TD>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>}

        {/* ── Tab 5: High Bills ──────────────────────── */}
        {tab===5&&<div>
          <div style={{background:"#FAEEDA",border:"0.5px solid #FAC775",borderRadius:"var(--border-radius-md)",padding:"9px 14px",marginBottom:"1rem",fontSize:12}}>
            Avg rate: <strong>₹{avgPU}/unit</strong> · Stores above ₹{Math.round(highThr)}/unit flagged as high-cost
          </div>
          <div style={{marginBottom:"1.5rem"}}>
            <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:6,textTransform:"uppercase",letterSpacing:".04em"}}>Per-Unit Rate (₹/kWh) — Top 15</div>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={perUnit.slice(0,15)} layout="vertical" barSize={9}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false}/>
                <XAxis type="number" tick={{fontSize:9}} tickFormatter={v=>"₹"+v}/>
                <YAxis type="category" dataKey="store" tick={{fontSize:8}} width={130}/>
                <Tooltip contentStyle={{fontSize:10}} formatter={v=>["₹"+v+"/unit"]}/>
                <Bar dataKey="pu" radius={[0,2,2,0]} name="Rate">
                  {perUnit.slice(0,15).map((d,i)=><Cell key={i} fill={d.pu>highThr?"#E24B4A":d.pu>avgPU?"#EF9F27":"#1D9E75"}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".04em"}}>High-Rate Stores (Above ₹{Math.round(highThr)}/unit)</div>
            <button onClick={()=>downloadCSV("high-bills.csv",["State","Store","Units","Amount","Rate per Unit (₹)","vs Avg"],perUnit.filter(s=>s.pu>highThr).map(s=>[s.state,s.store,s.units,s.amount,s.pu,"+"+Math.round((s.pu-avgPU)/avgPU*100)+"%"]))} style={{fontSize:11,padding:"3px 9px",background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--border-radius-md)",cursor:"pointer",color:"var(--color-text-secondary)"}}>↓ CSV</button>
          </div>
          <div style={{overflowX:"auto",marginBottom:"1.5rem"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr>{["State","Store","Units","Amount","₹/Unit","vs Avg","Action"].map(h=><TH key={h}>{h}</TH>)}</tr></thead>
              <tbody>{perUnit.filter(s=>s.pu>highThr).map((s,i)=>(
                <tr key={i} style={{background:"#FFF8F5"}}>
                  <TD style={{fontSize:11,color:"var(--color-text-secondary)"}}>{s.state}</TD>
                  <TD style={{fontWeight:500}}>{s.store}</TD>
                  <TD>{fN(s.units)}</TD><TD>{fA(s.amount)}</TD>
                  <TD style={{fontWeight:500,color:"#A32D2D"}}>₹{s.pu}</TD>
                  <TD style={{color:"#A32D2D"}}>+{Math.round((s.pu-avgPU)/avgPU*100)}%</TD>
                  <TD style={{fontSize:11,color:"var(--color-text-tertiary)"}}>Review tariff / meter</TD>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:6,textTransform:"uppercase",letterSpacing:".04em"}}>Top 5 Highest Bills</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[...stores].filter(s=>s.amount).sort((a,b)=>b.amount-a.amount).slice(0,5).map((s,i)=>(
              <div key={i} style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"10px 14px",minWidth:130,flex:"1 1 130px"}}>
                <div style={{fontSize:10,color:"var(--color-text-tertiary)",marginBottom:3}}>{s.state}</div>
                <div style={{fontSize:12,fontWeight:500,marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.store}</div>
                <div style={{fontSize:18,fontWeight:500,color:i===0?"#A32D2D":"var(--color-text-primary)"}}>{fA(s.amount)}</div>
                <div style={{fontSize:10,color:"var(--color-text-tertiary)"}}>{fN(s.units)} kWh</div>
              </div>
            ))}
          </div>
        </div>}

        {/* ── Tab 6: Reminders ───────────────────────── */}
        {tab===6&&<div>
          <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",marginBottom:"1rem",overflow:"hidden"}}>
            <button onClick={()=>setSettingsOpen(p=>!p)} style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"transparent",border:"none",cursor:"pointer",fontSize:13,fontWeight:500}}>
              <span>⚙ Contact Settings</span>
              <span style={{fontSize:11,color:"var(--color-text-secondary)"}}>{settingsOpen?"▲ Hide":"▼ Configure emails & WhatsApp"}</span>
            </button>
            {settingsOpen&&<div style={{padding:"0 14px 14px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {["CHETHAN","THARUN"].map(name=>(
                <div key={name} style={{background:"var(--color-background-primary)",borderRadius:"var(--border-radius-sm)",padding:"10px 12px"}}>
                  <div style={{fontWeight:500,fontSize:13,marginBottom:8}}>{name}</div>
                  <label style={{fontSize:11,color:"var(--color-text-secondary)",display:"block",marginBottom:3}}>Email</label>
                  <input type="email" placeholder={`${name.toLowerCase()}@kushals.com`} value={contacts[name]} onChange={e=>setContacts(p=>({...p,[name]:e.target.value}))} style={{width:"100%",fontSize:12,padding:"5px 8px",borderRadius:"var(--border-radius-sm)",border:"0.5px solid var(--color-border-secondary)",background:"var(--color-background-secondary)",marginBottom:8}}/>
                  <label style={{fontSize:11,color:"var(--color-text-secondary)",display:"block",marginBottom:3}}>WhatsApp (with country code)</label>
                  <input type="tel" placeholder="+91 98765 43210" value={waNum[name]} onChange={e=>setWaNum(p=>({...p,[name]:e.target.value}))} style={{width:"100%",fontSize:12,padding:"5px 8px",borderRadius:"var(--border-radius-sm)",border:"0.5px solid var(--color-border-secondary)",background:"var(--color-background-secondary)"}}/>
                </div>
              ))}
            </div>}
          </div>

          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:"1rem"}}>
            {Object.entries(URGENCY).map(([k,cfg])=>{const c=(grouped[k]||[]).length;if(!c)return null;
              return <div key={k} style={{background:cfg.bg,border:`1px solid ${cfg.border}`,borderRadius:20,padding:"3px 10px",fontSize:12,color:cfg.color,fontWeight:500}}>{cfg.icon} {c} {cfg.label}</div>;
            })}
            {needsReminder.length===0&&<div style={{fontSize:13,color:"var(--color-text-tertiary)"}}>🎉 All stores up to date — no reminders needed!</div>}
          </div>

          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:"1rem",flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:2,background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:3}}>
              {[["whatsapp","💬 WhatsApp"],["email","✉ Email"]].map(([t,l])=>(
                <button key={t} onClick={()=>setMsgType(t)} style={{padding:"5px 11px",fontSize:12,fontWeight:msgType===t?500:400,background:msgType===t?"var(--color-background-primary)":"transparent",border:msgType===t?"0.5px solid var(--color-border-secondary)":"none",borderRadius:"var(--border-radius-sm)",cursor:"pointer"}}>{l}</button>
              ))}
            </div>
            {selCount>0&&<>
              <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>{selCount} selected</span>
              <button onClick={batchSend} disabled={batchBusy} style={{padding:"6px 14px",fontSize:12,fontWeight:500,background:"#185FA5",color:"#fff",border:"none",borderRadius:"var(--border-radius-md)",cursor:"pointer"}}>
                {batchBusy?"Sending…":`✉ Send ${selCount} Email${selCount>1?"s":""}`}
              </button>
              <button onClick={()=>setSelected({})} style={{fontSize:12,padding:"6px 10px",background:"transparent",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--border-radius-md)",cursor:"pointer"}}>Clear</button>
            </>}
          </div>

          {batchRes&&<div style={{background:batchRes.fail===0?"#EAF3DE":"#FAEEDA",border:`0.5px solid ${batchRes.fail===0?"#8AC44A":"#FAC775"}`,borderRadius:"var(--border-radius-md)",padding:"8px 14px",fontSize:12,marginBottom:"1rem",color:batchRes.fail===0?"#3B6D11":"#854F0B"}}>
            {batchRes.fail===0?`✓ All ${batchRes.ok} emails sent`:`${batchRes.ok} sent · ${batchRes.fail} failed — check Settings`}
          </div>}

          {Object.entries(URGENCY).map(([urgency,cfg])=>{
            const storeList=grouped[urgency];if(!storeList?.length)return null;
            return <div key={urgency} style={{marginBottom:"1.5rem"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span>{cfg.icon}</span>
                  <span style={{fontWeight:500,fontSize:13,color:cfg.color}}>{cfg.label}</span>
                  <span style={{background:cfg.bg,color:cfg.color,fontSize:11,padding:"1px 7px",borderRadius:10,fontWeight:500}}>{storeList.length}</span>
                </div>
                <button onClick={()=>selAll(urgency)} style={{fontSize:11,color:"var(--color-text-secondary)",background:"transparent",border:"none",cursor:"pointer",textDecoration:"underline"}}>
                  {storeList.every(s=>selected[s.store])?"Deselect all":"Select all"}
                </button>
              </div>

              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {storeList.map(store=>{
                  const mk=store.store+msgType,msg=msgCache[mk],isExp=expanded===store.store,
                        isSending=sending[store.store],sentSt=sent[store.store];
                  return <div key={store.store} style={{background:"var(--color-background-secondary)",border:`0.5px solid ${isExp?cfg.border:"var(--color-border-tertiary)"}`,borderRadius:"var(--border-radius-md)",overflow:"hidden"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",flexWrap:"wrap"}}>
                      <input type="checkbox" checked={!!selected[store.store]} onChange={e=>setSelected(p=>({...p,[store.store]:e.target.checked}))} style={{cursor:"pointer",flexShrink:0}}/>
                      <div style={{flex:1,minWidth:130}}>
                        <div style={{fontWeight:500,fontSize:13}}>{store.store}</div>
                        <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:1}}>
                          {store.state} · {store.responsible}
                          {store.due_date&&<span style={{marginLeft:8,color:cfg.color,fontWeight:500}}>
                            {store.d<0?`${Math.abs(store.d)}d overdue`:store.d===0?"Due today":`${store.d}d left`}
                          </span>}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:5,fontSize:11,flexShrink:0,flexWrap:"wrap"}}>
                        {!store.has_invoice&&<span style={{background:"#F1EFE8",color:"#5F5E5A",padding:"2px 6px",borderRadius:8}}>No invoice</span>}
                        {store.has_invoice&&!store.amount&&<span style={{background:"#FAEEDA",color:"#854F0B",padding:"2px 6px",borderRadius:8}}>Amt missing</span>}
                        {store.amount&&<span style={{background:"var(--color-background-primary)",color:"var(--color-text-secondary)",padding:"2px 6px",borderRadius:8}}>₹{store.amount.toLocaleString("en-IN")}</span>}
                      </div>
                      <div style={{display:"flex",gap:5,flexShrink:0}}>
                        <button onClick={()=>toggleExpand(store)} style={{fontSize:11,padding:"4px 9px",borderRadius:"var(--border-radius-sm)",border:"0.5px solid var(--color-border-secondary)",background:"var(--color-background-primary)",cursor:"pointer"}}>
                          {isExp?"▲ Hide":"💬 Preview"}
                        </button>
                        {msgType==="whatsapp"&&waNum[store.responsible]&&msg&&msg!=="loading"&&(
                          <a href={`https://wa.me/${waNum[store.responsible].replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"
                            style={{fontSize:11,padding:"4px 9px",borderRadius:"var(--border-radius-sm)",background:"#25D366",color:"#fff",textDecoration:"none"}}>WA ↗</a>
                        )}
                        {msgType==="email"&&(
                          <button onClick={()=>handleSend(store)} disabled={isSending||sentSt==="sent"} style={{fontSize:11,padding:"4px 9px",borderRadius:"var(--border-radius-sm)",background:sentSt==="sent"?"#EAF3DE":sentSt==="failed"?"#FCEBEB":"#185FA5",color:sentSt?(sentSt==="sent"?"#3B6D11":"#A32D2D"):"#fff",border:"none",cursor:"pointer"}}>
                            {isSending?"…":sentSt==="sent"?"✓":sentSt==="failed"?"✗":"✉"}
                          </button>
                        )}
                      </div>
                    </div>
                    {isExp&&<div style={{borderTop:"0.5px solid var(--color-border-tertiary)",padding:"10px 12px",background:"var(--color-background-primary)"}}>
                      {!msg||msg==="loading"?(
                        <div style={{fontSize:12,color:"var(--color-text-tertiary)",display:"flex",alignItems:"center",gap:8}}>
                          <span style={{display:"inline-block",width:12,height:12,border:"2px solid var(--color-border-secondary)",borderTopColor:"var(--color-text-primary)",borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
                          Generating {msgType} message…
                        </div>
                      ):(
                        <div>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                            <span style={{fontSize:10,fontWeight:500,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".04em"}}>{msgType==="whatsapp"?"WhatsApp Message":"Email Body"}</span>
                            <div style={{display:"flex",gap:5}}>
                              <button onClick={()=>copyMsg(mk,msg)} style={{fontSize:11,padding:"2px 8px",borderRadius:"var(--border-radius-sm)",border:"0.5px solid var(--color-border-secondary)",background:"var(--color-background-secondary)",cursor:"pointer"}}>
                                {copied[mk]?"✓ Copied":"Copy"}
                              </button>
                              <button onClick={async()=>{setMsgCache(p=>({...p,[mk]:"loading"}));const m=await apiMsg(store,msgType);setMsgCache(p=>({...p,[mk]:m}));}} style={{fontSize:11,padding:"2px 8px",borderRadius:"var(--border-radius-sm)",border:"0.5px solid var(--color-border-secondary)",background:"var(--color-background-secondary)",cursor:"pointer"}}>↻</button>
                            </div>
                          </div>
                          <div style={{fontSize:13,lineHeight:1.65,whiteSpace:"pre-wrap",background:"var(--color-background-secondary)",padding:"9px 11px",borderRadius:"var(--border-radius-sm)"}}>{msg}</div>
                          {msgType==="whatsapp"&&!waNum[store.responsible]&&<div style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:5}}>💡 Add {store.responsible}'s WhatsApp in Settings for a direct send link.</div>}
                          {msgType==="email"&&!contacts[store.responsible]&&<div style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:5}}>💡 Add {store.responsible}'s email in Settings to send directly.</div>}
                        </div>
                      )}
                    </div>}
                  </div>;
                })}
              </div>
            </div>;
          })}
        </div>}
      </>}

      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
    </div>
  );
}
