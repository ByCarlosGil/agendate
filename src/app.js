export function startAgenda(backend){
const $=s=>document.querySelector(s);
const state={tasks:[],tab:"pend",cat:"all",light:null,day:null,editing:null,sound:false,ready:false};
let store=null; // {save(id,obj), remove(id)}
let mcp=null; // conector de Google Calendar (null si no está disponible)
const LS="agendate-v1";
const ls={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};

/* ---------- utilidades de fecha ---------- */
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parseDue=t=>{if(!t.date)return null;const [y,m,d]=t.date.split("-").map(Number);const [hh,mm]=(t.time||"23:59").split(":").map(Number);return new Date(y,m-1,d,hh,mm)};
const fmtDay=s=>{const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d).toLocaleDateString("es-CO",{weekday:"short",day:"numeric",month:"short"})};
function status(t,now){
  if(t.done)return"done";
  const due=parseDue(t); if(!due)return"grey";
  if(due<now)return"red";
  if(t.date===ymd(now)||due-now<864e5)return"amber";
  return"green";
}
function nextDate(t){
  const [y,m,d]=t.date.split("-").map(Number);const dt=new Date(y,m-1,d);
  const today=new Date();today.setHours(0,0,0,0);
  do{ if(t.repeat==="daily")dt.setDate(dt.getDate()+1); else if(t.repeat==="weekly")dt.setDate(dt.getDate()+7); else dt.setMonth(dt.getMonth()+1);}while(dt<today);
  return ymd(dt);
}
function relTime(due,now){
  const diff=due-now,abs=Math.abs(diff),min=Math.round(abs/6e4),h=Math.round(abs/36e5),d=Math.round(abs/864e5);
  const txt=min<60?min+" min":h<48?h+" h":d+" días";
  return diff<0?"hace "+txt:"en "+txt;
}

/* ---------- render ---------- */
const LABEL={red:"Vencidas",amber:"Para hoy",green:"A tiempo",grey:"Sin fecha",done:"Completadas"};
const CATI={trabajo:"💼",personal:"🙂",hogar:"🏠"};
const REP={daily:"🔁 Diaria",weekly:"🔁 Semanal",monthly:"🔁 Mensual"};
function esc(s){const d=document.createElement("div");d.textContent=s==null?"":String(s);return d.innerHTML}

function render(){
  const now=new Date();
  $("#today").textContent=now.toLocaleDateString("es-CO",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  const counts={red:0,amber:0,green:0,grey:0};
  state.tasks.forEach(t=>{const s=status(t,now);if(counts[s]!=null)counts[s]++});
  for(const k in counts)$("#n-"+k).textContent=counts[k];
  document.querySelectorAll(".light").forEach(b=>b.setAttribute("aria-pressed",String(state.light===b.dataset.light)));
  document.title=(counts.red+counts.amber?"("+(counts.red+counts.amber)+") ":"")+"Agendate";

  // barra de alerta
  const bar=$("#alertBar");
  if(!state.ready){bar.className="alert green";bar.textContent="Cargando tus tareas…";}
  else if(counts.red){bar.className="alert red";bar.innerHTML="🚨 "+counts.red+(counts.red>1?" tareas vencidas":" tarea vencida")+" <span>· "+(counts.amber?counts.amber+" más para hoy. ":"")+"Empieza por las rojas.</span>";}
  else if(counts.amber){bar.className="alert amber";bar.innerHTML="⏰ "+counts.amber+(counts.amber>1?" tareas":" tarea")+" para hoy <span>· vas a tiempo, no las dejes para el final.</span>";}
  else {bar.className="alert green";bar.innerHTML="✅ Todo al día <span>· "+(counts.green?counts.green+" pendientes a tiempo.":"agrega tu primera tarea con «Nueva tarea».")+"</span>";}

  // semana
  const wk=$("#week");wk.innerHTML="";
  const start=new Date(now);start.setHours(0,0,0,0);
  for(let i=0;i<7;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);const key=ymd(d);
    const items=state.tasks.filter(t=>!t.done&&t.date===key);
    const b=document.createElement("button");b.className="day"+(i===0?" today":"");
    b.setAttribute("aria-pressed",String(state.day===key));
    b.innerHTML='<span class="wd">'+(i===0?"Hoy":d.toLocaleDateString("es-CO",{weekday:"short"}))+'</span><span class="dn mono">'+d.getDate()+'</span><span class="cnt">'+(items.length?items.length+(items.length>1?" tareas":" tarea"):"")+'</span>';
    b.onclick=()=>{state.day=state.day===key?null:key;state.light=null;state.tab="pend";syncTabs();render()};
    wk.appendChild(b);
  }

  // lista
  let list=state.tasks.filter(t=>state.cat==="all"||t.category===state.cat);
  if(state.tab==="done")list=list.filter(t=>t.done);
  else{
    list=list.filter(t=>!t.done);
    if(state.light)list=list.filter(t=>status(t,now)===state.light);
    if(state.day)list=list.filter(t=>t.date===state.day);
  }
  const prio={alta:0,media:1,baja:2};
  list.sort((a,b)=>{const da=parseDue(a),db=parseDue(b);if(da&&db&&+da!==+db)return da-db;if(!!da!==!!db)return da?-1:1;return (prio[a.priority]??1)-(prio[b.priority]??1)});
  if(state.tab==="done")list.sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));

  const el=$("#list");el.innerHTML="";
  if(!state.ready){el.innerHTML='<div class="empty">Cargando…</div>';return}
  if(!list.length){
    el.innerHTML='<div class="empty">'+(state.tab==="done"?"Aún no has completado tareas. ¡Tú puedes! 💪":(state.day||state.light||state.cat!=="all")?"No hay tareas con este filtro 🎉":"Tu agenda está vacía. Toca <b>＋ Nueva tarea</b> para anotar la primera ✍️")+'</div>';return;
  }
  const order=state.tab==="done"?["done"]:["red","amber","green","grey"];
  order.forEach(s=>{
    const items=list.filter(t=>status(t,now)===s);if(!items.length)return;
    const g=document.createElement("section");g.className="group";
    g.innerHTML='<h2>'+(s!=="done"?'<i class="dot d-'+s+'"></i>':"")+LABEL[s]+' <span class="mono">'+items.length+'</span></h2>';
    items.forEach(t=>g.appendChild(taskEl(t,s,now)));
    el.appendChild(g);
  });
}
function taskEl(t,s,now){
  const due=parseDue(t);
  const row=document.createElement("article");row.className="task s-"+s+(t.done?" done":"");
  const pillCls={red:"red",amber:"amber",green:"green"}[s]||"";
  row.innerHTML=
    '<button class="check" aria-label="'+(t.done?"Marcar como pendiente":"Marcar como hecha")+'">'+(t.done?"✓":"")+'</button>'+
    '<button class="body"><span class="tt">'+esc(t.title)+'</span>'+(t.notes?'<span class="notes">'+esc(t.notes)+'</span>':"")+
    '<span class="meta">'+(t.priority==="alta"?'<span class="pill pr-alta">🔥 Alta</span>':t.priority==="baja"?'<span class="pill">Baja</span>':"")+
    '<span class="pill">'+(CATI[t.category]||"")+" "+esc(t.category||"")+'</span>'+
    (REP[t.repeat]?'<span class="pill">'+REP[t.repeat]+'</span>':"")+
    (t.gcal?'<span class="pill cal">📲 En Calendar</span>':"")+
    (t.remind>=0&&due&&!t.done?'<span class="pill">🔔 '+({0:"a la hora",15:"15 min antes",60:"1 h antes",1440:"1 día antes"}[t.remind]||"")+'</span>':"")+
    (due&&!t.done?'<span class="pill '+pillCls+'">'+relTime(due,now)+'</span>':"")+
    '</span></button>'+
    '<div class="when mono">'+(t.date?fmtDay(t.date):"—")+(t.time?"<br>"+t.time:"")+'</div>';
  row.querySelector(".check").onclick=()=>toggle(t);
  row.querySelector(".body").onclick=()=>openForm(t);
  return row;
}
function syncTabs(){document.querySelectorAll(".tab").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.tab===state.tab)))}

/* ---------- acciones ---------- */
async function persist(t){try{await store.save(t.id,clean(t))}catch(e){toast("No se pudo guardar: "+(e&&e.message||"error")+". Revisa tu conexión e inténtalo de nuevo.")}}
function clean(t){const o={...t};delete o.id;return o}
async function toggle(t){
  if(!t.done&&t.repeat&&t.repeat!=="none"&&t.date){
    t.date=nextDate(t);t.streak=(t.streak||0)+1;upsertLocal(t);render();
    toast("🔁 ¡Hecha! Reprogramada para "+fmtDay(t.date));await persist(t);return;
  }
  t.done=!t.done;t.doneAt=t.done?Date.now():null;upsertLocal(t);render();
  if(t.done)toast("🎉 ¡Bien hecho! «"+t.title+"» completada");
  await persist(t);
}
function upsertLocal(t){const i=state.tasks.findIndex(x=>x.id===t.id);if(i<0)state.tasks.push(t);else state.tasks[i]=t}

let delArmed=false;
function openForm(t,pre){
  state.editing=t||null;delArmed=false;
  $("#formTitle").textContent=t?"Editar tarea":"Nueva tarea";
  $("#f-title").value=t?t.title:"";$("#f-notes").value=t?(t.notes||""):"";
  $("#f-date").value=t?(t.date||""):(state.day||ymd(new Date()));$("#f-time").value=t?(t.time||""):"";
  $("#f-pri").value=t?t.priority||"media":"media";$("#f-cat").value=t?t.category||"personal":(state.cat!=="all"?state.cat:"personal");
  $("#f-rem").value=String(t?(t.remind??15):15);$("#f-rep").value=t?t.repeat||"none":"none";
  $("#delBtn").hidden=!t;$("#delBtn").textContent="Eliminar";
  $("#gcalRow").hidden=!mcp||!!(t&&t.gcal);$("#f-gcal").checked=true;
  if(pre){
    $("#formTitle").textContent="Revisa y guarda ✨";
    $("#f-title").value=pre.title||"";$("#f-notes").value=pre.notes||"";
    $("#f-date").value=pre.date||"";$("#f-time").value=pre.time||"";
    if(pre.priority)$("#f-pri").value=pre.priority;if(pre.category)$("#f-cat").value=pre.category;
    if(pre.remind!=null)$("#f-rem").value=String(pre.remind);if(pre.repeat)$("#f-rep").value=pre.repeat;
  }
  $("#sheetBg").hidden=false;setTimeout(()=>$("#f-title").focus(),30);
}
function closeForm(){$("#sheetBg").hidden=true;state.editing=null}
$("#addBtn").onclick=()=>openForm(null);
$("#cancelBtn").onclick=closeForm;
$("#sheetBg").addEventListener("click",e=>{if(e.target.id==="sheetBg")closeForm()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#sheetBg").hidden)closeForm()});
$("#form").addEventListener("submit",async e=>{
  e.preventDefault();
  const title=$("#f-title").value.trim();if(!title)return;
  const base=state.editing||{id:"t"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),done:false,createdAt:Date.now()};
  const t={...base,title,notes:$("#f-notes").value.trim(),date:$("#f-date").value,time:$("#f-time").value,priority:$("#f-pri").value,category:$("#f-cat").value,remind:Number($("#f-rem").value),repeat:$("#f-rep").value};
  const wantCal=mcp&&!t.gcal&&!$("#gcalRow").hidden&&$("#f-gcal").checked;
  forgetAlerted(t.id);upsertLocal(t);closeForm();render();
  toast(state.editing?"✏️ Tarea actualizada":"✅ Tarea anotada");
  await persist(t);
  if(wantCal){
    if(!t.date){toast("📅 Ponle fecha a la tarea para enviarla a Google Calendar");return}
    await sendToCalendar(t);
  }
});
function calArgs(t){
  const [y,m,d]=t.date.split("-").map(Number);
  const a={summary:t.title,description:(t.notes?t.notes+"\n\n":"")+"Creada desde Agendate · "+(CATI[t.category]||"")+" "+t.category+" · prioridad "+t.priority};
  if(t.time){
    const [hh,mm]=t.time.split(":").map(Number);const end=new Date(y,m-1,d,hh,mm+30);
    a.startTime=t.date+"T"+t.time+":00";a.endTime=ymd(end)+"T"+pad(end.getHours())+":"+pad(end.getMinutes())+":00";
  }else{
    const nx=new Date(y,m-1,d+1);a.allDay=true;a.startTime=t.date+"T00:00:00";a.endTime=ymd(nx)+"T00:00:00";a.availability="AVAILABILITY_FREE";
  }
  if(t.remind>=0)a.overrideReminders=[{method:"popup",minutes:t.time?t.remind:Math.max(t.remind,0)}];
  else a.useDefaultReminders=false;
  const rr={daily:"DAILY",weekly:"WEEKLY",monthly:"MONTHLY"}[t.repeat];if(rr)a.recurrenceData=["RRULE:FREQ="+rr];
  if(t.priority==="alta")a.colorId="11";
  return a;
}
async function sendToCalendar(t){
  try{
    await mcp.callTool("Google Calendar","create_event",calArgs(t));
    t.gcal=true;upsertLocal(t);render();toast("📲 ¡Listo! Agregada a tu Google Calendar");await persist(t);
  }catch(e){
    const c=e&&e.code;
    const msg=c==="needs_reauth"?"Vuelve a conectar Google Calendar en claude.ai → Configuración → Conectores.":
      c==="server_not_connected"?"Conecta Google Calendar en claude.ai → Configuración → Conectores.":
      c==="not_in_manifest"?"No diste permiso a Google Calendar para esta agenda. Puedes activarlo en el menú Permisos de la página.":
      "Google Calendar no respondió. Edita la tarea más tarde para intentarlo de nuevo.";
    toast("⚠️ No se pudo agregar a Calendar. "+msg,{sticky:true});
  }
}
$("#delBtn").onclick=async()=>{
  if(!delArmed){delArmed=true;$("#delBtn").textContent="¿Seguro? Toca otra vez";return}
  const t=state.editing;state.tasks=state.tasks.filter(x=>x.id!==t.id);closeForm();render();toast("🗑️ Tarea eliminada");
  try{await store.remove(t.id)}catch(e){toast("No se pudo eliminar. Inténtalo de nuevo.")}
};
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;state.light=null;state.day=null;syncTabs();render()});
document.querySelectorAll(".chip").forEach(b=>b.onclick=()=>{state.cat=b.dataset.cat;document.querySelectorAll(".chip").forEach(c=>c.setAttribute("aria-pressed",String(c===b)));render()});
document.querySelectorAll(".light").forEach(b=>b.onclick=()=>{state.light=state.light===b.dataset.light?null:b.dataset.light;state.day=null;state.tab="pend";syncTabs();render()});

/* ---------- agenda rápida (texto o voz) ---------- */
let sampler=null;
const NUM={un:1,una:1,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12,quince:15,veinte:20,treinta:30,media:30};
const MESES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DIAS=["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
const deacc=s=>s.normalize("NFD").replace(/[̀-ͯ]/g,"");
function localParse(raw){
  let o=" "+raw.normalize("NFC").toLowerCase()+" ";let s=deacc(o);if(s.length!==o.length)o=s;
  const out={remind:15,repeat:"none",priority:"media",category:"personal"};
  const blank=(i,l)=>{const sp=" ".repeat(l);s=s.slice(0,i)+sp+s.slice(i+l);o=o.slice(0,i)+sp+o.slice(i+l)};
  const cut=x=>{const mm=x instanceof RegExp?s.match(x):x;if(mm&&mm.index!=null)blank(mm.index,mm[0].length)};
  const now=new Date();const base=new Date(now);base.setHours(0,0,0,0);
  const n=w=>/^\d+$/.test(w)?Number(w):NUM[w];
  // recordatorio
  let m=s.match(/(?:recuerd|record|avis)\w*\s+(\w+)\s+(minutos?|min|horas?|dias?)\s+antes/);
  if(m){const q=n(m[1])||1;out.remind=/^h/.test(m[2])?q*60:/^d/.test(m[2])?q*1440:q;cut(m)}
  else if(/sin recordatorio|no me recuerd/.test(s)){out.remind=-1;cut(/sin recordatorio|no me recuerd\w*/)}
  else if((m=s.match(/(?:avisame|recuerdame)\s+(?:a la hora|en el momento)/))){out.remind=0;cut(m)}
  else if((m=s.match(/(?:avisame|recuerdame)\b/)))cut(m);
  // repetición
  if((m=s.match(/\b(todos los dias|cada dia|diariamente|diario)\b/))){out.repeat="daily";cut(m)}
  else if((m=s.match(/\b(cada semana|semanalmente|todas las semanas|todos los (lunes|martes|miercoles|jueves|viernes|sabados|domingos))\b/))){out.repeat="weekly";if(m[2]){const i=DIAS.findIndex(d=>m[2].startsWith(d));const d=new Date(base);d.setDate(d.getDate()+((i-d.getDay()+7)%7));out.date=ymd(d)}cut(m)}
  else if((m=s.match(/\b(cada mes|mensualmente|todos los meses)\b/))){out.repeat="monthly";cut(m)}
  // prioridad
  if((m=s.match(/\b(urgente|importante|prioridad alta|sin falta)\b/))){out.priority="alta";cut(m)}
  else if((m=s.match(/\b(prioridad baja|sin afan|cuando pueda)\b/))){out.priority="baja";cut(m)}
  // fecha
  if(!out.date){
    if((m=s.match(/\bpasado manana\b/))){const d=new Date(base);d.setDate(d.getDate()+2);out.date=ymd(d);cut(m)}
    else if((m=s.match(/(?<!(?:de la|en la|por la) )\bmanana\b/))){const d=new Date(base);d.setDate(d.getDate()+1);out.date=ymd(d);cut(m)}
    else if((m=s.match(/\bhoy\b/))){out.date=ymd(base);cut(m)}
    else if((m=s.match(/\b(?:el\s+)?(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/))){
      let d=new Date(base.getFullYear(),MESES.indexOf(m[2]),Number(m[1]));if(d<base)d.setFullYear(d.getFullYear()+1);out.date=ymd(d);cut(m)}
    else if((m=s.match(/\b(?:el\s+|este\s+|el proximo\s+|proximo\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/))){
      const i=DIAS.indexOf(m[1]);const d=new Date(base);let add=(i-d.getDay()+7)%7;if(add===0||/proximo/.test(m[0]))add=add||7;d.setDate(d.getDate()+add);out.date=ymd(d);cut(m)}
    else if((m=s.match(/\b(?:el\s+)?(\d{1,2})[\/-](\d{1,2})\b/))){let d=new Date(base.getFullYear(),Number(m[2])-1,Number(m[1]));if(d<base)d.setFullYear(d.getFullYear()+1);out.date=ymd(d);cut(m)}
  }
  // hora
  if((m=s.match(/\b(?:a las?|a la)\s+(\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?:[:.](\d{2})|\s+y\s+(media|cuarto|\w+))?\s*(am|a\.?m\.?|pm|p\.?m\.?|de la manana|de la tarde|de la noche|del mediodia)?/)) || (m=s.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/))){
    let h=n(m[1]);let mi=0;
    if(m[2]&&/^\d+$/.test(m[2]))mi=Number(m[2]);else if(m[3])mi=m[3]==="media"?30:m[3]==="cuarto"?15:(n(m[3])||0);
    const suf=(m[4]||m[3]||"")+"";
    if(/pm|p\.m|tarde|noche/.test(suf)&&h<12)h+=12;else if(/am|a\.m|manana/.test(suf)&&h===12)h=0;
    else if(!/am|a\.m|manana|mediodia/.test(suf)&&h>=1&&h<=6)h+=12; // "a las 3" = 3 pm
    if(h>=0&&h<24){out.time=pad(h)+":"+pad(Math.min(mi,59));if(!out.date)out.date=ymd(base)}
    cut(m);
  }else if((m=s.match(/\b(en la manana|por la manana|en la tarde|por la tarde|en la noche|por la noche|al mediodia)\b/))){
    out.time=/manana/.test(m[0])?"08:00":/tarde/.test(m[0])?"15:00":/noche/.test(m[0])?"19:00":"12:00";cut(m)}
  // categoría
  if(/\b(reunion|informe|analista|operativ|lectur|factura|jefe|oficina|trabajo|indicador|cliente|proyecto|correo)/.test(s))out.category="trabajo";
  else if(/\b(casa|lavar|limpiar|mercado|servicios|arriendo|cocinar|ropa|hogar|pagar)/.test(s))out.category="hogar";
  // título: quitar conectores sobrantes
  let title=o.replace(/\s+/g," ").replace(/^[\s,.;:-]*(?:agenda(?:r|me)?|anota(?:r|me)?|recordar|tengo que|debo|necesito|hay que)\s+/,"").replace(/^\s*(?:para|el|la|de|que|y)\s+/,"").replace(/[\s,.;:-]+(?:y|para|el|la|de|a|que)?\s*$/,"").trim();
  out.title=title?title.charAt(0).toUpperCase()+title.slice(1):raw.trim();
  return out;
}
async function smartParse(text){
  const local=localParse(text);
  if(!sampler)return local;
  const now=new Date();
  const prompt="Convierte esta nota en una tarea de agenda. Hoy es "+now.toLocaleDateString("es-CO",{weekday:"long",day:"numeric",month:"long",year:"numeric"})+" ("+ymd(now)+"), hora actual "+pad(now.getHours())+":"+pad(now.getMinutes())+", zona horaria de Colombia.\n"+
    "Nota: «"+text+"»\n"+
    "Responde SOLO un objeto JSON con estas claves: title (texto corto y claro, sin fecha ni hora, primera letra mayúscula), notes (detalles extra o \"\"), date (\"YYYY-MM-DD\" o \"\" si no se menciona; si hay hora pero no fecha, usa hoy, o mañana si esa hora ya pasó), time (\"HH:MM\" 24 h o \"\"; «a las 3» sin am/pm es 15:00 salvo contexto de mañana), priority (\"alta\" si dice urgente/importante, \"baja\" si dice sin afán, si no \"media\"), category (\"trabajo\", \"personal\" u \"hogar\"), remind (minutos antes: -1 si pide no recordar, 0 a la hora, 15, 60 o 1440; por defecto 15), repeat (\"none\", \"daily\", \"weekly\" o \"monthly\").";
  try{
    const r=await sampler.json(prompt,{modelTier:"quick"});
    if(!r||typeof r!=="object"||!r.title)return local;
    const ok=(v,list,def)=>list.includes(v)?v:def;
    return{title:String(r.title).slice(0,140),notes:String(r.notes||"").slice(0,600),
      date:/^\d{4}-\d{2}-\d{2}$/.test(r.date)?r.date:"",time:/^\d{2}:\d{2}$/.test(r.time)?r.time:"",
      priority:ok(r.priority,["alta","media","baja"],"media"),category:ok(r.category,["trabajo","personal","hogar"],local.category),
      remind:[-1,0,15,60,1440].includes(Number(r.remind))?Number(r.remind):15,repeat:ok(r.repeat,["none","daily","weekly","monthly"],"none")};
  }catch(e){return local}
}
$("#quick").addEventListener("submit",async e=>{
  e.preventDefault();const text=$("#q-text").value.trim();if(!text){$("#q-text").focus();return}
  const btn=$("#q-go");btn.disabled=true;btn.textContent="Entendiendo…";
  const pre=await smartParse(text);
  btn.disabled=false;btn.textContent="Agendar";$("#q-text").value="";
  openForm(null,pre);
});
// Dictado: usa el reconocimiento del navegador si la página lo permite; si no, el micrófono del teclado.
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;let rec=null;
$("#q-mic").onclick=()=>{
  const tip=()=>{$("#q-text").focus();toast("🎤 Toca el micrófono de tu teclado y dicta tu tarea. Luego pulsa «Agendar».")};
  if(!SR){tip();return}
  if(rec){rec.stop();return}
  try{
    rec=new SR();rec.lang="es-CO";rec.interimResults=true;rec.maxAlternatives=1;
    const before=$("#q-text").value;
    rec.onresult=ev=>{let t="";for(const r of ev.results)t+=r[0].transcript;$("#q-text").value=(before?before+" ":"")+t};
    rec.onerror=()=>{rec=null;$("#q-mic").classList.remove("on");tip()};
    rec.onend=()=>{rec=null;$("#q-mic").classList.remove("on");if($("#q-text").value.trim()&&$("#q-text").value!==before)$("#quick").requestSubmit()};
    rec.start();$("#q-mic").classList.add("on");toast("🎙️ Te escucho… habla y espera un momento");
  }catch(err){rec=null;tip()}
};

/* ---------- avisos ---------- */
function toast(msg,opts={}){
  const box=$("#toasts");const el=document.createElement("div");el.className="toast"+(opts.alarm?" alarm":"");
  const span=document.createElement("span");span.textContent=msg;el.appendChild(span);
  const b=document.createElement("button");b.textContent=opts.action||"OK";b.onclick=()=>{el.remove();opts.onAction&&opts.onAction()};el.appendChild(b);
  box.appendChild(el);
  if(!opts.sticky)setTimeout(()=>el.remove(),4500);
  while(box.children.length>4)box.firstChild.remove();
}
let actx=null;
function chime(){
  if(!state.sound)return;
  try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();
    [880,660,880].forEach((f,i)=>{const o=actx.createOscillator(),g=actx.createGain();o.frequency.value=f;o.type="sine";o.connect(g);g.connect(actx.destination);const t0=actx.currentTime+i*.22;g.gain.setValueAtTime(.0001,t0);g.gain.exponentialRampToValueAtTime(.25,t0+.02);g.gain.exponentialRampToValueAtTime(.0001,t0+.2);o.start(t0);o.stop(t0+.22)});
  }catch(e){}
}
$("#soundBtn").onclick=()=>{
  state.sound=!state.sound;ls.set(LS+"-sound",state.sound?"1":"0");syncSound();
  if(state.sound){chime();toast("🔔 Sonido activado para los recordatorios")}
};
function syncSound(){$("#soundBtn").textContent=state.sound?"🔔 Sonido activado":"🔕 Sonido apagado";$("#soundBtn").setAttribute("aria-pressed",String(state.sound))}
state.sound=ls.get(LS+"-sound")==="1";syncSound();

const alerted=new Set((ls.get(LS+"-alerted")||"").split(",").filter(Boolean));
function forgetAlerted(id){[...alerted].forEach(k=>{if(k.startsWith(id+"@"))alerted.delete(k)});ls.set(LS+"-alerted",[...alerted].slice(-300).join(","))}
function checkReminders(){
  if(!state.ready)return;
  const now=new Date();
  state.tasks.forEach(t=>{
    if(t.done||!(t.remind>=0))return;const due=parseDue(t);if(!due)return;
    const key=t.id+"@"+t.date+"T"+(t.time||"");
    const at=new Date(due-t.remind*6e4);
    if(now>=at&&!alerted.has(key)&&now-due<12*36e5){
      alerted.add(key);ls.set(LS+"-alerted",[...alerted].slice(-300).join(","));
      const vencida=now>due;
      toast((vencida?"🚨 Vencida: ":"⏰ Recordatorio: ")+t.title+(t.time?" ("+t.time+")":""),{alarm:true,sticky:true,action:"Ver",onAction:()=>openForm(t)});
      chime();
    }
  });
}
setInterval(()=>{$("#clock").textContent=new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"});checkReminders();},15000);
setInterval(render,60000);
$("#clock").textContent=new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"});

/* ---------- almacenamiento ---------- */
function useLocal(note){
  const raw=ls.get(LS);let data={};try{data=raw?JSON.parse(raw):{}}catch(e){}
  state.tasks=Object.entries(data).map(([id,v])=>({id,...v}));
  store={async save(id,o){data[id]=o;ls.set(LS,JSON.stringify(data))},async remove(id){delete data[id];ls.set(LS,JSON.stringify(data))}};
  $("#storeNote").textContent=note;state.ready=true;render();checkReminders();
}
async function init(){
  render();
  store={save:backend.save,remove:backend.remove};
  $("#storeNote").textContent="🔒 Privada · se sincroniza con tu cuenta de Google";
  backend.subscribe(tasks=>{
    state.tasks=tasks;state.ready=true;render();checkReminders();
  },()=>toast("Se perdió la conexión con tus tareas. Revisa tu internet."));
}
init();
}
