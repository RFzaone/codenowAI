import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Archive, ChevronDown, Code2, Copy, File, FilePlus2, FolderOpen, MessageSquarePlus,
  Moon, Search, Send, Settings, Sparkles, Sun, Trash2, Upload, X, Zap, Crown, Gift,
  Check, UserRound, CreditCard, LogOut, ShieldCheck
} from "lucide-react";
import "./styles.css";

type Plan = "free" | "plus" | "pro";
type Mode = "light" | "medium" | "advanced";
type Message = { role: "user" | "assistant"; content: string };
type Chat = { id: string; title: string; messages: Message[] };
type ProjectFile = { path: string; content: string };
type Project = { files: ProjectFile[]; memory: string; name: string };
type Profile = { name: string; avatar: string; plan: Plan; userId: string };

const MODELS: Record<Plan, string> = {
  free: "@cf/zai-org/glm-4.7-flash",
  plus: "@cf/qwen/qwen3-30b-a3b-fp8",
  pro: "@cf/zai-org/glm-5.3-flash",
};
const PLAN_NAMES: Record<Plan, string> = { free: "Free", plus: "Plus", pro: "Pro" };
const CHAT_KEY = "codenow-cloud-chats-v2";
const PROJECT_KEY = "codenow-cloud-project-v2";
const THEME_KEY = "codenow-cloud-theme-v2";
const PROFILE_KEY = "codenow-profile-v1";
const INTRO_KEY = "codenow-onboarding-v2";

function newChat(): Chat { return { id: crypto.randomUUID(), title: "New chat", messages: [] }; }
function titleFor(text: string) { return text.replace(/[`*_#]/g, "").trim().split(/\s+/).slice(0, 7).join(" ") || "New chat"; }
function load<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || "") as T; } catch { return fallback; } }
function save(key: string, value: unknown) { localStorage.setItem(key, JSON.stringify(value)); }
function downloadBlob(blob: Blob, name: string) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function parseStreamChunk(text: string) {
  let out = "";
  for (const line of text.split("\n")) {
    const raw = line.trim(); if (!raw || raw === "data: [DONE]") continue;
    const value = raw.startsWith("data:") ? raw.slice(5).trim() : raw;
    try { const j = JSON.parse(value); out += String(j?.response ?? j?.choices?.[0]?.delta?.content ?? j?.choices?.[0]?.message?.content ?? ""); } catch {}
  }
  return out;
}
function MessageRenderer({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return <div className="messageText">{parts.map((p, i) => p.startsWith("```") ? <div className="codeBlock" key={i}>
    <button onClick={() => navigator.clipboard?.writeText(p.replace(/^```[^\n]*\n?/, "").replace(/```$/, ""))}><Copy size={14}/> Copy</button>
    <pre>{p.replace(/^```[^\n]*\n?/, "").replace(/```$/, "")}</pre>
  </div> : <span key={i}>{p}</span>)}</div>;
}

const planInfo = {
  free: { icon: Zap, price: "$0", title: "Free", desc: "Get coding with the fast model.", features: ["GLM-4.7-Flash", "40 messages/day", "Project workspace", "ZIP import & export"] },
  plus: { icon: Sparkles, price: "Plus", title: "Plus", desc: "More reasoning and more room.", features: ["Qwen3-30B-A3B", "300 messages/day", "Bigger project context", "Priority generation"] },
  pro: { icon: Crown, price: "Pro", title: "Pro", desc: "The serious coding tier.", features: ["GLM-5.3-Flash", "1,000 messages/day", "Maximum context", "Advanced coding workflows"] },
} as const;

export default function App() {
  const storedProfile = load<Profile | null>(PROFILE_KEY, null);
  const [intro, setIntro] = useState(() => localStorage.getItem(INTRO_KEY) !== "1");
  const [onboardStep, setOnboardStep] = useState(0);
  const [draftName, setDraftName] = useState(storedProfile?.name || "");
  const [draftAvatar, setDraftAvatar] = useState(storedProfile?.avatar || "");
  const [profile, setProfile] = useState<Profile>(storedProfile || { name: "", avatar: "", plan: "free", userId: crypto.randomUUID() });
  const [theme, setTheme] = useState<"light"|"dark">(() => load(THEME_KEY, "light"));
  const [chats, setChats] = useState<Chat[]>(() => { const c = load<Chat[]>(CHAT_KEY, []); return c.length ? c : [newChat()]; });
  const [activeId, setActiveId] = useState("");
  const [mode, setMode] = useState<Mode>("medium");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminSecret, setAdminSecret] = useState(() => sessionStorage.getItem("codenow-admin-secret") || "");
  const [adminPlan, setAdminPlan] = useState<"plus" | "pro">("plus");
  const [adminCount, setAdminCount] = useState(5);
  const [adminCodes, setAdminCodes] = useState<string[]>([]);
  const [adminStatus, setAdminStatus] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [project, setProject] = useState<Project>(() => load(PROJECT_KEY, { files: [], memory: "", name: "Untitled project" }));
  const [openFile, setOpenFile] = useState("");
  const [draft, setDraft] = useState("");
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemStatus, setRedeemStatus] = useState("");
  const chatEnd = useRef<HTMLDivElement>(null);
  const active = useMemo(() => chats.find(c => c.id === activeId) || chats[0], [chats, activeId]);

  useEffect(() => { if (!activeId && chats[0]) setActiveId(chats[0].id); }, [activeId, chats]);
  useEffect(() => save(CHAT_KEY, chats.slice(0, 20)), [chats]);
  useEffect(() => save(PROJECT_KEY, project), [project]);
  useEffect(() => save(THEME_KEY, theme), [theme]);
  useEffect(() => save(PROFILE_KEY, profile), [profile]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [active?.messages]);
  useEffect(() => {
    fetch('/api/event', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({event:'site_open'}) }).catch(()=>{});
    fetch(`/api/entitlement?userId=${encodeURIComponent(profile.userId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.plan) setProfile(p => ({...p, plan: data.plan as Plan})); })
      .catch(()=>{});
  }, [profile.userId]);

  function finishOnboarding() {
    if (!draftName.trim()) return;
    const next = { ...profile, name: draftName.trim(), avatar: draftAvatar, plan: profile.plan || "free" as Plan };
    setProfile(next); save(PROFILE_KEY, next); localStorage.setItem(INTRO_KEY, "1"); setIntro(false);
  }
  function skipIntro() { localStorage.setItem(INTRO_KEY, "1"); setIntro(false); }
  function pickAvatar(e: ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; if (!f) return; if (f.size > 2_000_000) return alert("Please choose an image under 2 MB."); const r = new FileReader(); r.onload = () => setDraftAvatar(String(r.result || "")); r.readAsDataURL(f); }
  function createChat() { const c = newChat(); setChats(x => [c, ...x].slice(0, 20)); setActiveId(c.id); }
  function deleteChat(id: string) { const next = chats.filter(c => c.id !== id); const safe = next.length ? next : [newChat()]; setChats(safe); if (id === activeId) setActiveId(safe[0].id); }
  async function sendMessage() {
    const text = input.trim(); if (!text || busy || !active) return;
    const user = { role:"user" as const, content:text }; const messages = [...active.messages, user];
    setChats(x => x.map(c => c.id === active.id ? {...c, title:c.messages.length?c.title:titleFor(text), messages:[...messages,{role:"assistant",content:""}]} : c));
    setInput(""); setBusy(true);
    try {
      const context = project.files.length ? `Project: ${project.name}\nMemory: ${project.memory || "(none)"}\nFiles:\n${project.files.slice(0, 40).map(f=>`\n--- ${f.path} ---\n${f.content.slice(0,7000)}`).join("\n")}` : "No project files imported.";
      const res = await fetch("/api/chat", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ plan:profile.plan, userId:profile.userId, mode, messages, projectContext:context }) });
      if (!res.ok) { const err = await res.json().catch(()=>({error:`HTTP ${res.status}`})); throw new Error(err.error || "AI request failed"); }
      if (!res.body) throw new Error("The AI returned no stream.");
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let full = "";
      while (true) { const {value,done}=await reader.read(); if(done) break; full += parseStreamChunk(decoder.decode(value,{stream:true})); const shown=full; setChats(x=>x.map(c=>c.id===active.id?{...c,messages:c.messages.map((m,i)=>i===c.messages.length-1?{...m,content:shown}:m)}:c)); }
      if (!full) throw new Error("The AI returned an empty response.");
    } catch(e) { const msg=e instanceof Error?e.message:"Unknown error"; setChats(x=>x.map(c=>c.id===active.id?{...c,messages:c.messages.map((m,i)=>i===c.messages.length-1?{...m,content:`Error: ${msg}`}:m)}:c)); }
    finally { setBusy(false); }
  }
  async function importZip(file: File) { try { const zip=await JSZip.loadAsync(file); const files:ProjectFile[]=[]; for(const [path,entry] of Object.entries(zip.files)) if(!entry.dir&&!path.includes("__MACOSX")) files.push({path:path.replace(/^\/+/,""),content:await entry.async("string")}); setProject({files,memory:"",name:file.name.replace(/\.zip$/i,"")||"Imported project"}); setOpenFile(files[0]?.path||""); setDraft(files[0]?.content||""); } catch { alert("That ZIP could not be opened."); } }
  async function exportZip() { const zip=new JSZip(); project.files.forEach(f=>zip.file(f.path,f.content)); if(project.memory) zip.file(".codenow/memory.md",project.memory); downloadBlob(await zip.generateAsync({type:"blob"}),`${project.name||"codenow-project"}.zip`); fetch("/api/event",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({event:"download"})}).catch(()=>{}); }
  function selectFile(path:string){const f=project.files.find(x=>x.path===path);if(!f)return;setOpenFile(path);setDraft(f.content)}
  function saveFile(){if(!openFile)return;setProject(p=>({...p,files:p.files.map(f=>f.path===openFile?{...f,content:draft}:f)}))}
  function newFile(){const path=prompt("File path, e.g. src/main.py");if(!path)return;if(project.files.some(f=>f.path===path))return;setProject(p=>({...p,files:[...p.files,{path,content:""}]}));setOpenFile(path);setDraft("")}
  function deleteFile(){if(!openFile||!confirm(`Delete ${openFile}?`))return;setProject(p=>({...p,files:p.files.filter(f=>f.path!==openFile)}));setOpenFile("");setDraft("")}
  async function redeem() {
    const code = redeemCode.trim().toUpperCase();
    if (!code) return;
    setRedeemStatus("Checking code…");
    try {
      const res = await fetch("/api/redeem", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code,userId:profile.userId})});
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Redemption failed.");
      const nextPlan = data.plan as Plan;
      setProfile(p => ({...p, plan:nextPlan}));
      setRedeemCode("");
      setRedeemStatus(`Activated ${PLAN_NAMES[nextPlan]}! This code is now used.`);
      fetch("/api/event",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({event:"redemption"})}).catch(()=>{});
    } catch(e) {
      setRedeemStatus(e instanceof Error ? e.message : "Redemption failed.");
    }
  }
  function choosePlan(plan: Plan) { if(plan === "free") { setPlansOpen(false); return; } setRedeemStatus("Have a code? Enter it below to activate this plan."); }
  function openAdmin() {
    setSettingsOpen(false);
    setAdminStatus("");
    setAdminOpen(true);
  }
  async function generateAdminCodes() {
    const secret = adminSecret.trim();
    const count = Math.min(Math.max(Math.floor(Number(adminCount) || 1), 1), 100);
    if (!secret) { setAdminStatus("Enter your ADMIN_CODE_SECRET first."); return; }
    setAdminBusy(true);
    setAdminStatus("Generating codes…");
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ plan: adminPlan, count }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Generation failed (HTTP ${res.status}).`);
      const codes = Array.isArray(data.codes) ? data.codes.map(String) : [];
      setAdminCodes(codes);
      sessionStorage.setItem("codenow-admin-secret", secret);
      setAdminStatus(`${codes.length} ${adminPlan.toUpperCase()} code${codes.length === 1 ? "" : "s"} generated.`);
    } catch (e) {
      setAdminCodes([]);
      setAdminStatus(e instanceof Error ? e.message : "Code generation failed.");
    } finally {
      setAdminBusy(false);
    }
  }
  async function copyAdminCodes() {
    if (!adminCodes.length) return;
    await navigator.clipboard?.writeText(adminCodes.join("\n"));
    setAdminStatus(`${adminCodes.length} codes copied to clipboard.`);
  }
  function clearAdminSession() {
    sessionStorage.removeItem("codenow-admin-secret");
    setAdminSecret("");
    setAdminCodes([]);
    setAdminStatus("Admin secret cleared from this browser session.");
  }
  const filtered = project.files.filter(f=>f.path.toLowerCase().includes(search.toLowerCase()));

  if (intro) return <div className={`onboarding ${theme}`}>
    <div className="onboardGlow"/><div className="onboardCard">
      <button className="onboardSkip" onClick={skipIntro}>Skip</button>
      <img className="onboardLogo" src="/codenow-logo.png"/><div className="onboardProgress"><i className={onboardStep>=0?"on": ""}/><i className={onboardStep>=1?"on": ""}/><i className={onboardStep>=2?"on": ""}/></div>
      {onboardStep===0 && <><span className="eyebrow">WELCOME TO CODENOW</span><h1>Let's get you set up.</h1><p>Your workspace is ready. What should CodeNow call you?</p><input autoFocus className="onboardInput" value={draftName} onChange={e=>setDraftName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&draftName.trim())setOnboardStep(1)}} placeholder="Your name"/><button className="primary big" disabled={!draftName.trim()} onClick={()=>setOnboardStep(1)}>Continue <ChevronDown size={17} className="rotateNeg"/></button></>}
      {onboardStep===1 && <><span className="eyebrow">YOUR PROFILE</span><h1>Make it yours.</h1><p>Want a profile picture? You can change it later in Settings.</p><label className="avatarPicker">{draftAvatar?<img src={draftAvatar}/>:<UserRound size={34}/>}<input type="file" accept="image/*" onChange={pickAvatar}/><span>{draftAvatar?"Change picture":"Choose a picture"}</span></label><button className="secondary big" onClick={()=>setOnboardStep(2)}>Skip picture</button><button className="primary big" onClick={()=>setOnboardStep(2)}>Continue</button></>}
      {onboardStep===2 && <><span className="eyebrow">READY TO CODE</span><h1>Welcome, {draftName.trim()}.</h1><p>Start free, or redeem a Plus/Pro code whenever you have one.</p><div className="miniPlans"><div><Zap size={17}/><b>Free</b><span>GLM-4.7-Flash</span></div><div><Sparkles size={17}/><b>Plus</b><span>Qwen3-30B</span></div><div><Crown size={17}/><b>Pro</b><span>GLM-5.3-Flash</span></div></div><button className="primary big" onClick={finishOnboarding}>Enter CodeNow <Send size={17}/></button></>}
    </div>
  </div>;

  return <div className={`app ${theme}`}>
    <aside className="sidebar">
      <div className="brand"><img src="/codenow-logo.png"/><div><b>CodeNow</b><span>Cloud Coding AI</span></div></div>
      <button className="newChat" onClick={createChat}><MessageSquarePlus size={18}/> New chat</button>
      <button className="planButton" onClick={()=>setPlansOpen(true)}><span className={`planDot ${profile.plan}`}/><span>{PLAN_NAMES[profile.plan]} plan</span><ChevronDown size={15}/></button>
      <div className="label">Chats</div><div className="chatList">{chats.map(c=><div className={`chat ${c.id===activeId?"active":""}`} key={c.id} onClick={()=>setActiveId(c.id)}><span>{c.title}</span><button onClick={e=>{e.stopPropagation();deleteChat(c.id)}}><Trash2 size={14}/></button></div>)}</div>
      <div className="sidebarBottom"><button onClick={()=>setWorkspaceOpen(v=>!v)}><FolderOpen size={17}/> Workspace</button><button onClick={()=>setSettingsOpen(true)}><Settings size={17}/> Settings</button><button onClick={openAdmin}><ShieldCheck size={17}/> Admin</button><button onClick={()=>setTheme(theme==="light"?"dark":"light")}>{theme==="light"?<Moon size={17}/>:<Sun size={17}/>} {theme==="light"?"Dark mode":"Light mode"}</button><div className="profileMini"><div className="miniAvatar">{profile.avatar?<img src={profile.avatar}/>:<UserRound size={15}/>}</div><div><b>{profile.name||"Coder"}</b><span>{PLAN_NAMES[profile.plan]}</span></div></div></div>
    </aside>
    <main className="main">
      <header><div><h1>{active?.title||"CodeNow"}</h1><span>{project.name}</span></div><div className="headerActions"><div className="modePicker"><button className="modeButton"><Sparkles size={15}/>{mode[0].toUpperCase()+mode.slice(1)} <ChevronDown size={14}/></button><div className="modeMenu">{(["light","medium","advanced"] as Mode[]).map(m=><button key={m} onClick={()=>setMode(m)}>{m==="light"?<Zap size={14}/>:<Code2 size={14}/>} {m[0].toUpperCase()+m.slice(1)} {m!=="medium"&&<small>plan model</small>}</button>)}</div></div><button className="iconTop" onClick={()=>setWorkspaceOpen(v=>!v)}><FolderOpen size={17}/></button></div></header>
      <section className="chatArea">{!active?.messages.length?<div className="welcomeCard"><img src="/codenow-logo.png"/><span className="eyebrow">{PLAN_NAMES[profile.plan].toUpperCase()} MODE</span><h2>What are we coding?</h2><p>Ask CodeNow to build, debug, explain, refactor, or review your code.</p><div className="suggestions"><button onClick={()=>setInput("Build a clean starter project for ")}>Build an app</button><button onClick={()=>setInput("Debug this code and explain the exact bug:\n")}>Debug code</button><button onClick={()=>setInput("Refactor this code for clarity and performance:\n")}>Refactor</button></div><div className="modelBadge">{MODELS[profile.plan]}</div></div>:<div className="messages">{active.messages.map((m,i)=><article className={m.role} key={i}><div className="avatar">{m.role==="assistant"?<img src="/codenow-logo.png"/>:<>{profile.avatar?<img src={profile.avatar}/>:"You"}</>}</div><div><b>{m.role==="assistant"?"CodeNow":profile.name||"You"}</b><MessageRenderer content={m.content||(busy&&i===active.messages.length-1?"Thinking…":"")}/></div></article>)}<div ref={chatEnd}/></div>}</section>
      <footer><div className="composer"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage()}}} placeholder={`Message CodeNow · ${PLAN_NAMES[profile.plan]} · ${mode}…`}/><button onClick={sendMessage} disabled={!input.trim()||busy}><Send size={18}/></button></div><small>Enter to send · Shift+Enter for a new line</small></footer>
    </main>
    {workspaceOpen&&<aside className="workspace"><div className="panelHead"><div><b>Workspace</b><span>{project.files.length} files</span></div><button onClick={()=>setWorkspaceOpen(false)}><X size={18}/></button></div><div className="workspaceTools"><label><Upload size={15}/> Import ZIP<input type="file" accept=".zip,application/zip" onChange={e=>{const f=e.target.files?.[0];if(f)importZip(f)}}/></label><button onClick={newFile}><FilePlus2 size={15}/> New file</button><button onClick={exportZip}><Archive size={15}/> Export ZIP</button></div><div className="search"><Search size={14}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search files"/></div><div className="fileList">{filtered.map(f=><button className={f.path===openFile?"selected":""} key={f.path} onClick={()=>selectFile(f.path)}><File size={14}/>{f.path}</button>)}</div><div className="memory"><b>Project memory</b><textarea value={project.memory} onChange={e=>setProject(p=>({...p,memory:e.target.value}))} placeholder="Architecture, rules, TODOs…"/></div><div className="editor">{openFile?<><div className="editorHead"><b>{openFile}</b><div><button onClick={saveFile}>Save</button><button onClick={deleteFile}><Trash2 size={14}/></button></div></div><textarea className="codeEditor" spellCheck={false} value={draft} onChange={e=>setDraft(e.target.value)}/></>:<div className="noFile">Import a ZIP or create a file.</div>}</div></aside>}
    {settingsOpen&&<div className="modal"><section><button className="close" onClick={()=>setSettingsOpen(false)}><X/></button><h2>CodeNow settings</h2><div className="profileEdit"><div className="bigAvatar">{profile.avatar?<img src={profile.avatar}/>:<UserRound/>}</div><label className="secondary">Change picture<input type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>setProfile(p=>({...p,avatar:String(r.result||"")}));r.readAsDataURL(f)}}/></label></div><div className="setting"><b>Name</b><input value={profile.name} onChange={e=>setProfile(p=>({...p,name:e.target.value}))}/></div><div className="setting"><b>Plan</b><span>{PLAN_NAMES[profile.plan]} · <button className="inlineLink" onClick={()=>{setSettingsOpen(false);setPlansOpen(true)}}>Manage plan</button></span></div><div className="setting"><b>AI provider</b><span>Cloudflare Workers AI</span></div><div className="setting"><b>Model</b><span className="mono">{MODELS[profile.plan]}</span></div><div className="setting"><b>Storage</b><span>Chats, profile and project state stay in this browser.</span></div><button className="primary" onClick={()=>setSettingsOpen(false)}>Done</button></section></div>}
    {adminOpen&&<div className="modal adminModal"><section><button className="close" onClick={()=>setAdminOpen(false)}><X/></button><span className="eyebrow">CODENOW ADMIN</span><h2>Redeem code generator</h2><p className="modalLead">Generate single-use Plus or Pro codes directly from the deployed Worker. Your admin secret stays in this browser session only.</p><div className="adminGrid"><label><b>Admin secret</b><input type="password" autoComplete="off" value={adminSecret} onChange={e=>setAdminSecret(e.target.value)} placeholder="ADMIN_CODE_SECRET"/></label><label><b>Plan</b><select value={adminPlan} onChange={e=>setAdminPlan(e.target.value as "plus"|"pro")}><option value="plus">Plus</option><option value="pro">Pro</option></select></label><label><b>Quantity</b><input type="number" min="1" max="100" value={adminCount} onChange={e=>setAdminCount(Math.min(100, Math.max(1, Number(e.target.value)||1)))}/></label></div><div className="adminActions"><button className="primary" disabled={adminBusy||!adminSecret.trim()} onClick={generateAdminCodes}>{adminBusy?"Generating…":`Generate ${adminCount} ${adminPlan === "pro" ? "Pro" : "Plus"} code${adminCount===1?"":"s"}`}</button><button className="secondary" disabled={!adminCodes.length} onClick={copyAdminCodes}><Copy size={14}/> Copy all</button><button className="secondary" onClick={clearAdminSession}>Clear secret</button></div>{adminStatus&&<div className="redeemStatus"><ShieldCheck size={15}/>{adminStatus}</div>}<div className="adminCodes">{adminCodes.length?<>{adminCodes.map(code=><div className="adminCode" key={code}><code>{code}</code><button title="Copy code" onClick={()=>navigator.clipboard?.writeText(code)}><Copy size={14}/></button></div>)}</>:<div className="adminEmpty">Generated codes will appear here. Each code can be redeemed once.</div>}</div></div>}
    {plansOpen&&<div className="modal plansModal"><section><button className="close" onClick={()=>setPlansOpen(false)}><X/></button><span className="eyebrow">CODE NOW PLANS</span><h2>Pick your power level.</h2><p className="modalLead">Free is ready now. Plus and Pro activate with a redemption code.</p><div className="planGrid">{(Object.keys(planInfo) as Plan[]).map(p=>{const P=planInfo[p];const Icon=P.icon;return <div className={`planCard ${p} ${profile.plan===p?"current":""}`} key={p}><div className="planIcon"><Icon size={20}/></div><h3>{P.title}</h3><strong>{P.price}</strong><p>{P.desc}</p><ul>{P.features.map(x=><li key={x}><Check size={14}/>{x}</li>)}</ul><button className={profile.plan===p?"secondary":"primary"} onClick={()=>choosePlan(p)}>{profile.plan===p?"Current plan":p==="free"?"Use Free":"Redeem code"}</button></div>})}</div><div className="redeemBox"><div><Gift size={19}/><div><b>Have a Plus or Pro code?</b><span>Codes are single-use and checked by the CodeNow server.</span></div></div><div className="redeemRow"><input value={redeemCode} onChange={e=>setRedeemCode(e.target.value.toUpperCase())} placeholder="CN-PLUS-XXXXXX-XXXXXX"/><button className="primary" disabled={!redeemCode.trim()} onClick={redeem}>Redeem</button></div>{redeemStatus&&<div className="redeemStatus"><ShieldCheck size={15}/>{redeemStatus}</div>}</div></section></div>}
  </div>;
}
