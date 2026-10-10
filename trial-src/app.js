(function(){
"use strict";
var BOOKING_URL=""; // set later: booking link or WhatsApp
var $=function(s,r){return (r||document).querySelector(s)};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var esc=function(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})};
function money(n,cur){return (cur||"USD")+" "+Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
var ICON={
 lock:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
 check:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
 warn:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/></svg>',
 info:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
 arrow:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>',
 sun:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
 moon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/></svg>',
 copy:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
 file:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>'
};

/* ---------- sample emails (starting points only; the AI reads whatever is in the box) ---------- */
var S={
A:{label:"Sea, Suzhou to Dallas",tag:"Sea FCL",blurb:"Inland to inland. Ports are chosen for you.",
 email:"Hi team,\n\nPlease quote 2 x 40HC of LED lighting fixtures. We buy from a supplier in Suzhou, China (EXW, their factory) and the goods go to our distribution centre in Dallas, Texas. Total weight about 24 tons.\n\nWe would like 21 days of free time at destination. Please confirm transit time and the earliest sailing.\n\nThanks,\nDaniel",
 carrier:"Dear partner,\n\nRef PM-40418. Shanghai to Houston, 2 x 40HC:\n- Ocean freight USD 3,350 per 40HC\n- Origin THC USD 120 per 40HC\n- Inland haulage Suzhou to Shanghai USD 260 per 40HC\n- BL fee USD 55\n- Documentation USD 40\n\nTransit 28 to 32 days. Free time 14 days demurrage and detention. Valid 10 days. Subject to equipment availability.\n\nBest regards,\nPacific Meridian"},
B:{label:"Air, Toulouse to Singapore",tag:"Air AOG",blurb:"Urgent and complete. Nothing to ask, so no reply.",
 email:"Dear team,\n\nURGENT, AOG. We need air freight for 1 wooden crate with a replacement landing gear actuator, 210 kg gross, 120 x 80 x 90 cm, from Toulouse Blagnac (TLS) to Singapore Changi (SIN). Incoterm FCA. The cargo is ready now at our Toulouse warehouse and the aircraft is waiting.\n\nPlease quote the first available flight and confirm the transit time. No dangerous goods.\n\nRegards,\nPierre",
 carrier:"Hello,\n\nRef MA-9915. TLS to SIN, 1 crate, 210 kg gross, 0.86 CBM, AOG.\nChargeable weight 210 kg.\n- Air freight USD 4.20 per kg\n- Fuel surcharge USD 0.55 per kg\n- Security surcharge USD 0.15 per kg\n- AWB fee USD 40\n- AOG handling USD 120\n\nFirst available flight via Doha, transit 2 days. Valid 2 days.\n\nRegards,\nMeridian Air Cargo"},
C:{label:"Sea, Guadalajara to Hamburg",tag:"Spanish",blurb:"Written in Spanish. Returned in English, with a Spanish reply.",
 email:"Hola equipo,\n\nNecesitamos cotizar 1 contenedor de 20 pies con tequila embotellado, unas 14 toneladas, desde nuestra bodega en Guadalajara hasta el puerto de Hamburgo, Alemania. Incoterm FCA.\n\nPor favor indiquen el tiempo de tránsito y las condiciones de tiempo libre en destino.\n\nSaludos,\nLucía",
 carrier:"Dear team,\n\nRef AT-7302. Manzanillo to Hamburg, 1 x 20GP:\n- Ocean freight USD 2,150\n- Bunker surcharge USD 540\n- Origin THC USD 130\n- BL fee USD 60\n- Documentation USD 40\n\nTransit 24 to 28 days. Free time 10 days. Valid 9 days.\n\nRegards,\nAtlántica Line"},
D:{label:"Road, Rotterdam to Milan",tag:"Road FTL",blurb:"A full truck, urgent, with details missing.",
 email:"Hi,\n\nWe urgently need a truck from Rotterdam to Milan. 22 pallets of packaged consumer goods, about 16,500 kg in total, delivered DAP to our warehouse in Milan. Pickup tomorrow if possible.\n\nPlease quote a full truck and confirm the transit time.\n\nThanks,\nMarco",
 carrier:"Hello,\n\nRef ET-5521. Rotterdam to Milan, full truck, 22 pallets, about 16,500 kg.\n- Road freight FTL USD 1,780\n- Fuel surcharge USD 110\n- Alpine tolls and road fees USD 190\n\nTransit 2 days. Loading and unloading 24 h included. Valid 5 days. Pickup tomorrow is subject to confirmed addresses and pallet dimensions.\n\nRegards,\nEuroTrans"},
E:{key:"E",label:"Sea, Foshan to Amman",tag:"Arabic",blurb:"Written in Arabic. Returned in English, with an Arabic reply.",sender:"khaled@alamal-furniture.example",name:"Khaled",
 email:"مرحباً،\n\nنحتاج إلى عرض سعر لشحن حاوية واحدة 40 قدم (40HC) من الأثاث المكتبي، حوالي 11 طناً، من مصنع المورّد في مدينة فوشان بالصين إلى مستودعنا في عمّان، الأردن. الشحن بنظام EXW.\n\nنرجو تأكيد مدة الرحلة وفترة السماح (الوقت المجاني) في ميناء العقبة. نفضّل 14 يوماً على الأقل.\n\nشكراً،\nخالد",
 route:{from:"Guangzhou Nansha (CNNSA)",fc:"China",to:"Aqaba (JOAQJ)",tc:"Jordan",chosen:true,note:"The pickup is in Foshan and the delivery is in Amman, both inland. Nansha is the nearest major seaport to Foshan and Aqaba is Jordan's only seaport, so they become the Port of Loading and the Port of Discharge."},
 mode:"Sea",
 fields:[["Cargo","Office furniture"],["Equipment","1 x 40HC"],["Weight","11 tons"],["Incoterm","EXW"],["Pickup address",null],["Urgency","Standard"]],
 special:["Original language: Arabic","Inland pickup: supplier factory, Foshan","Inland delivery: warehouse, Amman","Free time at POD: 14 days minimum requested","Please confirm: transit time, free time at Aqaba"],
 missing:["Full pickup address of the supplier's factory in Foshan (required for EXW)","Cargo ready date"],conf:80,confL:"Medium",replyKind:"Missing information · Arabic",
 reply:"مرحباً خالد،\n\nشكراً لطلبكم شحن حاوية 1 x 40HC من الأثاث المكتبي من فوشان إلى عمّان.\n\nلنقدّم لكم سعراً دقيقاً نحتاج إلى معلومتين:\n1. العنوان الكامل لمصنع المورّد في فوشان، لأن الشحن بنظام EXW.\n2. التاريخ الذي ستكون فيه البضاعة جاهزة للاستلام.\n\nفور وصولها سنرسل لكم السعر ومدة الرحلة وخيارات فترة السماح في ميناء العقبة.",
 carrier:{name:"Red Sea Gulf Line",ref:"RG-6108",days:8,transit:"30 to 34 days",free:"14 days",equip:"1 x 40HC",lane:"Nansha to Aqaba",
  text:"Dear partner,\n\nRef RG-6108. Nansha to Aqaba, 1 x 40HC:\n- Ocean freight USD 2,980\n- Origin THC USD 125\n- Inland haulage Foshan to Nansha USD 240\n- BL fee USD 55\n- Documentation USD 40\n\nTransit 30 to 34 days. Free time 14 days demurrage and detention. Valid 8 days. Trucking from Aqaba to Amman is not included.\n\nBest regards,\nRed Sea Gulf",
  lines:[["Ocean freight","per 40HC",1,2980],["Origin THC Nansha","per 40HC",1,125],["Inland haulage Foshan to Nansha","per 40HC",1,240],["Bill of lading fee","per BL",1,55],["Documentation","per shipment",1,40]],
  flags:[["ok","Free time of 14 days matches the 14 days the client asked for."],["warn","Trucking from Aqaba to Amman is not included in this quote."],["ok","The charge lines add up to the carrier's stated total."]]}}
};
var ORDER=["A","B","C","D","E"];
var SAMPLE_BY_MODE={Sea:"A",Air:"B",Road:"D"};

/* ---------- state ---------- */
var st={lead:null,runId:null,tryNo:0,pick:null,file:null,file2:null,carrText:"",usedTries:0,total:2,parsed1:false,parsed2:false,finished:false,mtype:"percent",mval:12,fmt:"pdf",sheet:"Summary",t0:0,busy:false};
var cur=null,quote=null,srcText="";

/* ---------- helpers ---------- */
function toast(msg){var t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.h);toast.h=setTimeout(function(){t.classList.remove("show")},3200)}
function copy(text,ok){
  function fallback(){var ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();try{document.execCommand("copy");toast(ok)}catch(e){toast("Select the text and copy it")}document.body.removeChild(ta)}
  try{navigator.clipboard.writeText(text).then(function(){toast(ok)},fallback)}catch(e){fallback()}
}
function fmtDate(d){return new Date(d).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}
function fmtDur(ms){var s=Math.max(1,Math.round(ms/1000));return s<60?s+" seconds":Math.floor(s/60)+" min "+(s%60)+" s"}
function reduced(){return window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches}
function api(path,opts){
  opts=opts||{};opts.credentials="same-origin";
  return fetch(path,opts).then(function(r){return r.json().catch(function(){return {}}).then(function(j){return {ok:r.ok,status:r.status,json:j}})}).catch(function(){return {ok:false,status:0,json:{error:"No connection. Check your internet and try again."}}});
}
function post(path,body){return api(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})}
function logEv(type,extra,runId){var b={type:type,run_id:runId||st.runId||undefined};if(extra)for(var k in extra)b[k]=extra[k];post("/api/trial/event",b)}
/* Shows the steps while the real request runs; holds on the last step until it answers. */
function runProgress(el,labels,promise,done){
  el.innerHTML='<div class="card"><h3>Working on it</h3><div class="prog">'+labels.map(function(l,i){return '<div data-i="'+i+'"><span class="dot"></span><span>'+l+'</span></div>'}).join("")+'</div></div>';
  var i=0,rows=$$(".prog div",el),settled=false,result;
  promise.then(function(r){settled=true;result=r});
  function paint(upTo){rows.forEach(function(r,j){var d=$(".dot",r);if(!d)return;if(j<upTo){r.className="ok";d.outerHTML='<span class="dot" style="color:var(--good)">'+ICON.check+'</span>'}else if(j===upTo){r.className="on";d.outerHTML='<span class="dot spin"></span>'}})}
  function step(){
    if(i<rows.length-1){paint(i);i++;setTimeout(step,reduced()?60:900);return}
    paint(rows.length-1);
    (function wait(){if(settled){rows.forEach(function(r){r.className="ok"});done(result)}else setTimeout(wait,200)})();
  }
  step();
}
function errCard(el,title,msg,free){
  el.innerHTML='<div class="errcard" role="alert"><b>'+esc(title)+'</b><p>'+esc(msg)+'</p>'+(free?'<p class="hint">This did not use one of your tries.</p>':'')+'</div>';
}

/* ---------- theme ---------- */
function curDark(){var t=document.documentElement.getAttribute("data-theme");if(t)return t==="dark";return window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches}
function paintTheme(){$("#themeBtn").innerHTML=curDark()?ICON.sun:ICON.moon}
$("#themeBtn").addEventListener("click",function(){logEv("theme_switched");document.documentElement.setAttribute("data-theme",curDark()?"light":"dark");paintTheme()});
paintTheme();

/* ---------- login ---------- */
(function(){var m=/[?&]code=([^&]+)/.exec(location.search);if(m)$("#lgCode").value=decodeURIComponent(m[1]).toUpperCase();if(history.replaceState&&m)history.replaceState(null,"",location.pathname)})();
$("#loginForm").addEventListener("submit",function(e){
  e.preventDefault();$("#lgErr").textContent="";$("#lgBtn").disabled=true;
  post("/api/trial/login",{code:$("#lgCode").value,password:$("#lgPw").value}).then(function(r){
    $("#lgBtn").disabled=false;
    if(!r.ok){$("#lgErr").textContent=r.json.error||"Could not sign in.";return}
    $("#lgPw").value="";boot();
  });
});
$("#logoutBtn").addEventListener("click",function(){post("/api/trial/logout",{}).then(function(){location.reload()})});

/* ---------- boot ---------- */
function boot(){
  api("/api/trial/me").then(function(r){
    if(!r.ok){$("#loginBox").hidden=false;document.body.classList.add("locked-app");if(r.json&&r.json.error&&r.status!==401)$("#lgErr").textContent=r.json.error;return}
    var l=r.json.lead;st.lead=l;st.usedTries=l.triesUsed;st.total=l.triesTotal;
    $("#coName").textContent=l.company;paintAccess(l);
    $("#loginBox").hidden=true;document.body.classList.remove("locked-app");
    logEv("page_opened");
    renderSamples();ready1();renderIn2();renderExport();updateRail();paintTries();
    if(r.json.run)restore(r.json.run);
    startHelpers();
  });
}
function restore(run){
  st.runId=run.id;st.tryNo=run.tryNo;st.t0=Date.now();cur=viewToCur(run.request);srcText="";
  st.parsed1=true;st.mtype=run.markup.type;st.mval=run.markup.value;st.fmt=run.format||"pdf";
  renderResult1();renderReply1();
  if(run.quote){quote=run.quote;st.parsed2=true;renderQuote();renderMarkup();renderOut3()}
  renderIn2();updateRail();ready1();paintTries();
  toast("Your try in progress was restored.");
}
function viewToCur(v){return v}

/* ---------- step 1 ---------- */
var DROP_DEFAULT="Drop an email file here, or click to choose";
function renderSamples(){
  $("#sampbar").innerHTML=ORDER.map(function(k){var s=S[k];return '<button type="button" class="sample" data-k="'+k+'" aria-pressed="'+(st.pick===k)+'"><b>'+s.label+'</b><span class="tag">'+s.tag+'</span><small>'+s.blurb+'</small></button>'}).join("");
  $$(".sample").forEach(function(b){b.addEventListener("click",function(){
    st.pick=b.dataset.k;logEv("sample_picked",{feature:S[st.pick].label});st.file=null;$("#dropTxt").textContent=DROP_DEFAULT;
    $("#bodyIn").value=S[st.pick].email;renderSamples();ready1();
    try{$("#bodyIn").focus({preventScroll:true})}catch(e){}
  })});
}
function reveal(el){
  if(!el)return;
  var r=el.getBoundingClientRect();
  if(r.top<72||r.top>window.innerHeight*0.55)el.scrollIntoView({behavior:reduced()?"auto":"smooth",block:"start"});
}
function triesLeftForNew(){return st.usedTries<st.total}
function ready1(){
  var ok=$("#bodyIn").value.trim().length>10||!!st.file,hint=ok?"Ready. Edit the text first if you like.":"Pick a sample or paste your own email.";
  if(!st.runId&&!triesLeftForNew()){ok=false;hint="Both of your tries are used."}
  if(st.busy)ok=false;
  $("#parse1").disabled=!ok;$("#parse1hint").textContent=hint;
}
$("#bodyIn").addEventListener("input",function(){
  if(st.pick&&$("#bodyIn").value.indexOf(S[st.pick].email.slice(0,25))<0){st.pick=null;renderSamples()}
  if(st.file){st.file=null;$("#dropTxt").textContent=DROP_DEFAULT}
  ready1();
});
function readTextFile(f,done){
  if(!/\.(eml|txt)$/i.test(f.name)||!window.FileReader){done(null);return}
  var r=new FileReader();r.onload=function(){done(String(r.result||"").slice(0,20000))};r.onerror=function(){done(null)};r.readAsText(f);
}
function takeFile1(f){
  if(f.size>10*1024*1024){toast("That file is larger than 10 MB.");return}
  st.file=f;st.pick=null;logEv("file_dropped",{feature:"Step 1"});$("#dropTxt").textContent=f.name;renderSamples();
  readTextFile(f,function(t){if(t&&st.file===f)$("#bodyIn").value=t;ready1()});
  ready1();
}
$("#fileIn").addEventListener("change",function(e){var f=e.target.files&&e.target.files[0];if(f)takeFile1(f)});
function bindDrop(el,fn){
  ["dragenter","dragover"].forEach(function(ev){el.addEventListener(ev,function(e){e.preventDefault();el.classList.add("over")})});
  ["dragleave","drop"].forEach(function(ev){el.addEventListener(ev,function(e){e.preventDefault();el.classList.remove("over");if(ev==="drop"&&e.dataTransfer&&e.dataTransfer.files[0])fn(e.dataTransfer.files[0])})});
}
bindDrop($("#dropBox"),takeFile1);

var ph3=$("#out3").innerHTML;
$("#out2").dataset.ph=$("#out2").innerHTML;
function rl(m){return m==="Sea"?["PORT OF LOADING","PORT OF DISCHARGE"]:m==="Air"?["ORIGIN AIRPORT","DESTINATION AIRPORT"]:["ORIGIN","DESTINATION"]}

$("#parse1").addEventListener("click",function(){
  var text=$("#bodyIn").value,body,opts;
  st.busy=true;ready1();srcText=text;setTimeout(function(){reveal($("#out1"))},60);
  var source=st.file?"file":(st.pick&&text.indexOf(S[st.pick].email.slice(0,25))>-1?"sample":"paste");
  if(st.file&&!/\.txt$/i.test(st.file.name)){
    body=new FormData();body.append("file",st.file);body.append("text",text);body.append("source",source);if(st.runId)body.append("run_id",st.runId);
    opts={method:"POST",body:body};
  }else{opts={method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:text,source:source,run_id:st.runId||undefined})}}
  st.parsed2=false;st.finished=false;quote=null;st.carrText="";st.file2=null;
  $("#out2").innerHTML=$("#out2").dataset.ph;$("#markup2").innerHTML="";$("#done").innerHTML="";$("#out3").innerHTML=ph3;$("#reply1").innerHTML="";
  renderIn2();renderExport();
  runProgress($("#out1"),["Reading the email","Extracting the shipment details","Resolving ports and airports","Checking what is missing"],api("/api/trial/parse-request",opts),function(r){
    st.busy=false;
    if(!r.ok){st.parsed1=false;errCard($("#out1"),r.status===422?"This does not look like a rate request":"We could not read that email",r.json.error||"Please try again.",r.json.free||r.status===422);renderIn2();updateRail();ready1();return}
    var j=r.json;st.runId=j.runId;st.tryNo=j.tryNo;st.usedTries=j.triesUsed;st.total=j.triesTotal;
    if(!st.t0||!st.parsed1)st.t0=Date.now();
    cur=j.view;st.parsed1=true;
    renderResult1();renderReply1();renderIn2();updateRail();ready1();paintTries();onParsed1();reveal($("#out1"));
  });
});

function renderResult1(){
  var s=cur,r=s.route,L=rl(s.mode);
  var h='<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px"><div><span class="eyebrow">Parsed request</span></div><span class="masked" title="Masked, never stored">From '+esc(s.sender)+'</span></div>';
  h+='<div class="route"><div class="pt"><small>'+L[0]+'</small><b>'+esc(r.from)+'</b><span>'+esc(r.fc)+'</span></div><div class="arrow">'+ICON.arrow+'</div><div class="pt"><small>'+L[1]+'</small><b>'+esc(r.to)+'</b><span>'+esc(r.tc)+'</span></div></div>';
  if(r.chosen)h+='<div class="note"><span style="color:var(--accent-strong)">'+ICON.info+'</span><span><b>Ports chosen for you.</b> '+esc(r.note)+'</span></div>';
  if(s.portWarning)h+='<div class="flag warn" style="margin-bottom:14px"><span>'+ICON.warn+'</span><span><b>Check the ports.</b> '+esc(s.portWarning)+'</span></div>';
  h+='<div class="fields"><div class="field"><small>Mode</small><b>'+esc(s.mode)+'</b></div>'+s.fields.map(function(f){return f[1]?'<div class="field"><small>'+esc(f[0])+'</small><b>'+esc(f[1])+'</b></div>':'<div class="field empty"><small>'+esc(f[0])+'</small><b>Not given</b></div>'}).join("")+'</div>';
  if(s.special.length)h+='<div class="sub">Special requirements</div><div class="chips">'+s.special.map(function(x){return '<span class="chip">'+esc(x)+'</span>'}).join("")+'</div>';
  if(s.missing.length)h+='<div class="miss"><b>Missing before this can be priced</b><ul>'+s.missing.map(function(x){return '<li>'+esc(x)+'</li>'}).join("")+'</ul></div>';
  else h+='<div class="flag ok" style="margin-top:16px"><span>'+ICON.check+'</span><span>Nothing missing. This request can be priced as it is.</span></div>';
  h+='<div class="conf"><span>Confidence <b style="color:var(--ink)">'+esc(s.confL)+'</b></span><div class="bar"><i style="width:'+s.conf+'%"></i></div><span class="mono">'+s.conf+'%</span></div>';
  if(srcText)h+='<details style="margin-top:14px"><summary class="hint" style="cursor:pointer">Show the email as received</summary><div class="emailbox" dir="auto" style="margin:10px 0 0">'+esc(srcText)+'</div></details>';
  h+='</div>';
  $("#out1").innerHTML=h;
}
function renderReply1(){
  var s=cur,has=!!s.reply,left;
  if(has){
    left='<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><h3>Suggested reply</h3><span class="tag">'+esc(s.replyKind)+'</span></div><p class="hint" style="margin-bottom:12px">Written by the AI from what is missing, in the sender\'s language. Edit it, then copy it. Nothing is sent from the trial.</p><textarea class="reply" id="replyTxt" dir="auto" rows="9">'+esc(s.reply)+'</textarea><div style="margin-top:12px"><button class="btn btn-line btn-sm" id="copyReply" type="button">'+ICON.copy+' Copy reply</button></div></div>';
  }else{
    left='<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><h3>Suggested reply</h3><span class="tag">No reply needed</span></div><div class="flag ok" style="margin-top:14px"><span>'+ICON.check+'</span><span>The request is complete. There is nothing to ask the sender, so the AI suggests no reply and you can go straight to the carrier.</span></div></div>';
  }
  $("#reply1").innerHTML='<div class="grid2 g-reply">'+left
  +lockedBlock("Custom reply templates","Your own wording, tone and signature, chosen automatically by what is missing.",'<div class="card"><h3>Your reply templates</h3><div class="tpls" style="margin:10px 0 0"><div class="tpl"><b>Missing information</b><div class="thumb"></div></div><div class="tpl"><b>Acknowledgement</b><div class="thumb"></div></div></div></div>')+'</div>';
  var cr=$("#copyReply");if(cr)cr.addEventListener("click",function(){copy($("#replyTxt").value,"Reply copied");logEv("reply_copied")});
  bindLocks($("#reply1"));
}
function lockedBlock(name,desc,inner){
  return '<div class="locked">'+'<div class="inner">'+inner+'</div><div class="veil"><span class="lockbadge">'+ICON.lock+' Locked</span><b style="font:700 17px/1.2 var(--font-display)">'+esc(name)+'</b><span class="hint" style="max-width:30ch">'+esc(desc)+'</span><button type="button" class="btn btn-line btn-sm lockbtn" data-feat="'+esc(name)+'">Show me this</button></div></div>';
}
function bindLocks(root){$$(".lockbtn",root).forEach(function(b){b.addEventListener("click",function(){signal(b.dataset.feat)})})}
function signal(name){logEv("locked_click",{feature:name});tip("lock","Locked on purpose","This part belongs to the full system. We note what you tap, so your walkthrough starts with the features you care about.");toast("Noted. We will show \""+name+"\" in your walkthrough.")}

/* ---------- step 2 ---------- */
var DROP2="Drop a File";
function rfqRef(){return "RFQ-"+quoteNo().slice(3)}
function rfqParts(){
  var s=cur,r=s.route,L=rl(s.mode),cap=function(x){return x.charAt(0)+x.slice(1).toLowerCase()},ref=rfqRef();
  var subj="Rate request "+ref+": "+r.from+" to "+r.to+" ("+s.mode+")";
  var b="Hello,\n\nPlease quote the shipment below.\n\nReference: "+ref+"\nMode: "+s.mode+"\n"+cap(L[0])+": "+r.from+(r.fc?", "+r.fc:"")+"\n"+cap(L[1])+": "+r.to+(r.tc?", "+r.tc:"")+"\n";
  s.fields.forEach(function(f){if(f[1])b+=f[0]+": "+f[1]+"\n"});
  if(s.special.length)b+="\nSpecial requirements:\n"+s.special.map(function(x){return "- "+x}).join("\n")+"\n";
  if(s.missing.length)b+="\nStill to be confirmed by the shipper:\n"+s.missing.map(function(x){return "- "+x}).join("\n")+"\n";
  b+="\nPlease include in your quote:\n- Every charge itemised (freight, surcharges, local charges) with its basis and currency\n- Routing and transit time\n- Validity date\n- Free time or storage terms\n- Any conditions or exclusions (space, equipment, pickup, destination charges)\n\nPlease reply to this email and keep "+ref+" in the subject.\n\nBest regards,\n"+(st.lead&&st.lead.company?st.lead.company:"");
  return {subj:subj,body:b};
}
function renderRfq(){
  var box=$("#rfq2");
  if(!st.parsed1||!cur){box.innerHTML="";st.rfqKey=null;return}
  var key=String(st.runId);if(st.rfqKey===key&&box.firstChild)return;st.rfqKey=key;
  var e=rfqParts();
  box.innerHTML='<div class="card rfq"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><h3>Request for quotation to the carrier</h3><span class="tag">'+esc(rfqRef())+'</span></div>'
  +'<p class="hint" style="margin:6px 0 12px">Built from your request. In the full system this goes to your chosen carriers in one click and the reply comes back to the same reference. Here you can edit it and copy it. Nothing is sent from the trial.</p>'
  +'<label class="f" for="rfqSubj">Subject<input id="rfqSubj" dir="auto" value="'+esc(e.subj)+'"></label>'
  +'<textarea class="reply" id="rfqTxt" dir="auto" rows="14">'+esc(e.body)+'</textarea>'
  +'<div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-line btn-sm" id="cpRfq" type="button">'+ICON.copy+' Copy email</button><button class="btn btn-line btn-sm" id="cpRfqS" type="button">Copy subject</button></div></div>';
  $("#cpRfq").addEventListener("click",function(){copy($("#rfqTxt").value,"Request email copied");logEv("rfq_copied")});
  $("#cpRfqS").addEventListener("click",function(){copy($("#rfqSubj").value,"Subject copied")});
}
function renderIn2(){
  renderRfq();
  var on=st.parsed1,txt=st.carrText||"";
  $("#in2").innerHTML='<h3>Carrier reply</h3><p class="hint" style="margin-bottom:14px">'+(on?'Drop the carrier\'s email as a file, or paste its text. You can edit anything before it is read.':'Finish step 1 first. This step opens as soon as your request has been read.')+'</p>'
  +'<label class="drop big'+(on?'':' off')+'" id="drop2" for="file2"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0 4 4m-4-4L8 8"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg><b id="dropTxt2">'+esc(st.file2?st.file2.name:DROP2)+'</b><span class="hint">'+(st.file2?'File added':'The carrier\'s email as .eml, .msg or PDF. Or click to choose.')+'</span></label>'
  +'<input id="file2" type="file" accept=".eml,.msg,.pdf,.txt" hidden'+(on?'':' disabled')+'>'
  +'<div class="or"><span>or paste the text</span></div>'
  +'<textarea id="carrIn" dir="auto" rows="8" placeholder="Paste the carrier\'s reply here."'+(on?'':' disabled')+'>'+esc(txt)+'</textarea>'
  +'<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button class="btn btn-primary" id="parse2" type="button" disabled>Read this quote</button><button class="btn btn-line" id="loadC" type="button"'+(on?'':' disabled')+'>Load a sample quote</button></div>'
  +'<p class="hint" id="p2h" style="margin-top:10px"></p>';
  $("#parse2").addEventListener("click",parse2);
  $("#carrIn").addEventListener("input",function(){st.carrText=$("#carrIn").value;if(st.file2){st.file2=null;$("#dropTxt2").textContent=DROP2}ready2()});
  $("#loadC").addEventListener("click",function(){var k=st.pick||SAMPLE_BY_MODE[cur&&cur.mode]||"A";st.carrText=S[k].carrier;st.file2=null;renderIn2();ready2()});
  $("#file2").addEventListener("change",function(e){var f=e.target.files&&e.target.files[0];if(f)takeFile2(f)});
  bindDrop($("#drop2"),function(f){if(st.parsed1)takeFile2(f)});
  ready2();
}
function takeFile2(f){
  if(f.size>10*1024*1024){toast("That file is larger than 10 MB.");return}
  st.file2=f;
  readTextFile(f,function(t){if(t&&st.file2===f)st.carrText=t;renderIn2()});
  renderIn2();
}
function ready2(){
  var b=$("#parse2");if(!b)return;
  var ok=st.parsed1&&!st.parsed2&&!st.busy&&((st.carrText||"").trim().length>10||!!st.file2);
  b.disabled=!ok;
  $("#p2h").textContent=!st.parsed1?"":ok?"Ready.":(st.parsed2?"Quote read.":"Add the carrier's email to continue.");
}
function parse2(){
  var opts;st.busy=true;ready2();setTimeout(function(){reveal($("#out2"))},60);
  if(st.file2&&!/\.txt$/i.test(st.file2.name)){var fd=new FormData();fd.append("file",st.file2);fd.append("text",st.carrText||"");fd.append("run_id",st.runId);opts={method:"POST",body:fd}}
  else opts={method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:st.carrText,run_id:st.runId})};
  runProgress($("#out2"),["Reading the carrier email","Itemising every charge","Checking totals against the request","Raising flags"],api("/api/trial/parse-quote",opts),function(r){
    st.busy=false;
    if(!r.ok){errCard($("#out2"),"We could not read a quote",r.json.error||"Please try again.",true);ready2();return}
    quote=r.json.quote;st.parsed2=true;
    saveRun(false).then(function(){renderQuote();renderMarkup();renderOut3();updateRail();ready2();onParsed2();reveal($("#out2"))});
  });
}
function base(){return Math.round(quote.lines.reduce(function(t,l){return t+Math.round(l.amount*100)/100},0)*100)/100}
function pricing(){
  var b=base(),v=Number(st.mval)||0;if(v<0)v=0;
  var m=Math.round((st.mtype==="percent"?b*v/100:v)*100)/100,fin=Math.round((b+m)*100)/100,k=b>0?fin/b:1,sum=0;
  var lines=quote.lines.map(function(l,i,a){var amt=Math.round(l.amount*k*100)/100;if(i<a.length-1)sum+=amt;else amt=Math.round((fin-sum)*100)/100;return {label:l.label,basis:l.basis,qty:l.qty,amount:amt}});
  return {base:b,markup:m,final:fin,lines:lines};
}
var saveT=null;
function saveRun(evt,fmtChanged){
  if(!st.runId||!quote)return Promise.resolve();
  var p=post("/api/trial/run",{run_id:st.runId,markup_type:st.mtype,markup_value:Number(st.mval)||0,format:st.fmt,event:evt?"markup_set":(fmtChanged?"format_switched":undefined)});
  return p;
}
function saveSoon(){clearTimeout(saveT);saveT=setTimeout(function(){saveRun(true)},900)}
function renderQuote(){
  var q=quote,cur_=q.currency;
  var h='<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><div><span class="eyebrow">Parsed carrier quote</span><h3 style="margin-top:6px;font-size:24px">'+esc(q.name)+'</h3></div><span class="tag">Ref '+esc(q.ref)+'</span></div>';
  h+='<div class="kv"><div class="stat"><small>Carrier total</small><b class="mono">'+money(base(),cur_)+'</b></div><div class="stat"><small>Transit</small><b>'+esc(q.transit)+'</b></div><div class="stat"><small>Valid until</small><b>'+(q.validUntil?fmtDate(q.validUntil):"Not stated")+'</b></div><div class="stat"><small>Free time</small><b>'+esc(q.free)+'</b></div></div>';
  h+='<div class="tablewrap"><table class="lines"><thead><tr><th>Charge</th><th>Basis</th><th class="r">Qty</th><th class="r">Amount</th></tr></thead><tbody>'+q.lines.map(function(l){return '<tr><td>'+esc(l.label)+(l.note?'<br><span class="hint">'+esc(l.note)+'</span>':'')+'</td><td>'+esc(l.basis)+'</td><td class="r">'+l.qty+'</td><td class="r">'+money(l.amount,cur_)+'</td></tr>'}).join("")+'</tbody><tfoot><tr><td colspan="3">Carrier total</td><td class="r">'+money(base(),cur_)+'</td></tr></tfoot></table></div>';
  if(q.excluded&&q.excluded.length)h+='<div class="sub">Excluded or optional (not counted)</div><div class="tablewrap"><table class="lines"><tbody>'+q.excluded.map(function(l){return '<tr style="color:var(--muted)"><td>'+esc(l.label)+'</td><td>'+esc(l.basis)+'</td><td class="r">'+money(l.amount,cur_)+'</td></tr>'}).join("")+'</tbody></table></div>';
  h+='<div class="flags">'+q.flags.map(function(f){return '<div class="flag '+f[0]+'"><span>'+ICON[f[0]==="ok"?"check":f[0]==="warn"?"warn":"info"]+'</span><span>'+esc(f[1])+'</span></div>'}).join("")+'</div></div>';
  $("#out2").innerHTML=h;
}
function renderMarkup(){
  var p=pricing(),pct=p.final?(p.markup/p.final*100):0,c=quote.currency;
  var cmp='<div class="card"><h3>Compare carriers side by side</h3><table class="lines"><tbody><tr><td>Carrier 1</td><td class="r">4,885.00</td></tr><tr><td>Carrier 2</td><td class="r">4,720.00</td></tr><tr><td>Carrier 3</td><td class="r">5,010.00</td></tr></tbody></table></div>';
  $("#markup2").innerHTML='<div class="markup"><div class="card"><h3>Your markup</h3><p class="hint" style="margin-bottom:14px">Add it the way you quote. The prices in the quotation update as you type.</p><div class="tabs" role="group" aria-label="Markup type"><button type="button" data-m="percent" aria-selected="'+(st.mtype==="percent")+'">Percent</button><button type="button" data-m="flat" aria-selected="'+(st.mtype==="flat")+'">Flat amount ('+esc(c)+')</button></div><label class="f" for="mval">'+(st.mtype==="percent"?"Markup (%)":"Markup ("+esc(c)+")")+'<input id="mval" type="number" min="0" step="any" value="'+st.mval+'"></label>'
  +'<div class="kv" style="margin-bottom:0"><div class="stat"><small>Carrier cost</small><b class="mono" id="mBase">'+money(p.base,c)+'</b></div><div class="stat"><small>Your margin</small><b class="mono" id="mMar" style="color:var(--good)">'+money(p.markup,c)+'</b></div></div></div>'
  +'<div style="display:grid;gap:20px;align-content:start"><div class="card"><span class="eyebrow">You quote</span><div class="num" id="mFinal" style="color:var(--accent-strong);margin-top:8px">'+money(p.final,c)+'</div><p class="hint" id="mPct" style="margin-top:6px">Margin '+pct.toFixed(1)+'% of the selling price</p></div>'
  +lockedBlock("Quote comparison","Several carriers on one request, with the best rate and the gaps between them.",cmp)+'</div></div>';
  $$("#markup2 .tabs button").forEach(function(b){b.addEventListener("click",function(){st.mtype=b.dataset.m;st.mval=st.mtype==="percent"?12:150;renderMarkup();renderOut3();saveSoon()})});
  paintBreak();
  $("#mval").addEventListener("input",function(e){st.mTouched=true;st.mval=e.target.value;var q=pricing();$("#mMar").textContent=money(q.markup,c);$("#mFinal").textContent=money(q.final,c);$("#mPct").textContent="Margin "+(q.final?(q.markup/q.final*100):0).toFixed(1)+"% of the selling price";paintBreak();renderOut3();saveSoon()});
  bindLocks($("#markup2"));
}
/* the markup, shown on every charge: carrier cost + your share = what the client sees */
function paintBreak(){
  var p=pricing(),c=quote.currency,box=$("#mBreak");
  if(!box){box=document.createElement("div");box.id="mBreak";$("#markup2").appendChild(box)}
  var rows=p.lines.map(function(l,i){var cost=Math.round(quote.lines[i].amount*100)/100,mk=Math.round((l.amount-cost)*100)/100,pc=cost?mk/cost*100:0;
    return '<tr><td>'+esc(l.label)+'</td><td>'+esc(l.basis)+'</td><td class="r">'+money(cost,c)+'</td><td class="r m">+ '+money(mk,c)+'</td><td class="r m">'+pc.toFixed(1)+'%</td><td class="r"><b>'+money(l.amount,c)+'</b></td></tr>'}).join("");
  box.innerHTML='<div class="card bd" style="margin-top:20px"><h3>Where your markup lands</h3><p class="hint" style="margin:6px 0 12px">The markup is spread across every charge in proportion to its cost, so the client sees a clean quotation with no single hidden margin line.</p><div class="tablewrap"><table class="lines"><thead><tr><th>Charge</th><th>Basis</th><th class="r">Carrier</th><th class="r">Markup</th><th class="r">Markup %</th><th class="r">You quote</th></tr></thead><tbody>'+rows+'</tbody><tfoot><tr><td colspan="2">Total</td><td class="r">'+money(p.base,c)+'</td><td class="r m">+ '+money(p.markup,c)+'</td><td class="r m">'+(p.base?(p.markup/p.base*100).toFixed(1):"0.0")+'%</td><td class="r">'+money(p.final,c)+'</td></tr></tfoot></table></div></div>';
}

/* ---------- step 3 ---------- */
function quoteNo(){var c=(st.lead&&st.lead.code||"TRIAL").replace(/[^A-Z0-9]/gi,"").slice(0,6).toUpperCase();return "QT-"+c+"-"+("0"+(st.tryNo||1)).slice(-2)}
function emailParts(){
  var p=pricing(),s=cur,c=quote,lane=s.route.from+" to "+s.route.to;
  var subj="Quotation "+quoteNo()+": "+lane;
  var body="Hello "+(s.senderName||"there")+",\n\nThank you for your request. Please find our quotation for "+lane+(c.equip?" ("+c.equip+")":"")+".\n\nTotal: "+money(p.final,c.currency)+"\nTransit time: "+c.transit+"\nValid until: "+fmtDate(c.quoteValid)+"\n\n"+p.lines.map(function(l){return "- "+l.label+": "+money(l.amount,c.currency)}).join("\n")+"\n\nPrices are in "+c.currency+" and subject to space and equipment availability. The quotation is attached as a PDF.\n\nBest regards,\n"+(st.lead?st.lead.company:"");
  return {subj:subj,body:body};
}
function renderOut3(){
  if(!st.parsed2)return;
  var p=pricing(),s=cur,c=quote,cu=c.currency;
  var tpl='<div class="tpls"><button type="button" class="tpl" aria-pressed="true"><b>Default template</b><span class="hint">Clean layout with your price, validity and terms.</span><div class="thumb"></div></button>'
  +'<div class="locked"><div class="inner"><div class="tpl"><b>Custom template</b><span class="hint">Your logo, wording and layout.</span><div class="thumb"></div></div></div><div class="veil"><span class="lockbadge">'+ICON.lock+' Locked</span><button type="button" class="btn btn-line btn-sm lockbtn" data-feat="Branded quotation templates">Show me this</button></div></div></div>';
  var tabs='<div class="tabs" role="tablist" aria-label="Output format"><button type="button" role="tab" data-f="pdf" aria-selected="'+(st.fmt==="pdf")+'">PDF</button><button type="button" role="tab" data-f="mail" aria-selected="'+(st.fmt==="mail")+'">Email body</button></div>';
  var out;
  if(st.fmt==="pdf"){
    out='<div class="paper"><div class="top"><div><h4>QUOTATION</h4><div class="mono" style="font-size:12px;margin-top:8px">'+quoteNo()+' · '+fmtDate(new Date())+'</div></div><div style="font:700 17px/1.2 var(--font-display);text-align:right">'+esc(st.lead?st.lead.company:"")+'</div></div>'
    +'<table><tbody><tr><td><b>For</b><br>'+esc(s.senderName||"Your client")+'</td><td><b>Route</b><br>'+esc(s.route.from)+' to '+esc(s.route.to)+'</td><td><b>Valid until</b><br>'+fmtDate(c.quoteValid)+'</td></tr></tbody></table>'
    +'<table><thead><tr><th>Description</th><th>Basis</th><th class="r">Qty</th><th class="r">Amount ('+esc(cu)+')</th></tr></thead><tbody>'+p.lines.map(function(l){return '<tr><td>'+esc(l.label)+'</td><td>'+esc(l.basis)+'</td><td class="r">'+l.qty+'</td><td class="r">'+money(l.amount,cu)+'</td></tr>'}).join("")+'</tbody></table>'
    +'<div class="total"><span>Total</span><b>'+money(p.final,cu)+'</b></div><small>Transit time '+esc(c.transit)+'. Free time '+esc(c.free)+'. Prices in '+esc(cu)+', subject to space and equipment availability. Valid until '+fmtDate(c.quoteValid)+'.</small></div>'
    +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><button class="btn btn-primary" id="dlPdf" type="button">'+ICON.file+' Download PDF</button></div>';
  }else{
    var e=emailParts();
    out='<div class="mail"><div class="subj">'+esc(e.subj)+'</div>'+esc(e.body)+'<div><span class="attach">'+ICON.file+' '+esc(quoteNo())+'.pdf</span></div></div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><button class="btn btn-primary" id="cpMail" type="button">'+ICON.copy+' Copy email</button><button class="btn btn-line" id="cpSubj" type="button">Copy subject</button><button class="btn btn-line" id="dlPdf2" type="button">'+ICON.file+' Download the PDF attachment</button></div>';
  }
  var fin=!st.finished?'<div style="margin-top:22px"><button class="btn btn-primary" id="finish" type="button">Finish this try</button> <span class="hint">Logs the try as complete.</span></div>':'';
  $("#out3").innerHTML='<div class="grid2 g-out"><div class="card"><h3>Template</h3><p class="hint" style="margin-bottom:14px">Pick how the quotation looks. Same price and terms either way.</p>'+tpl+'<h3>Format</h3><p class="hint" style="margin-bottom:12px">Same content, two ways to send it.</p>'+tabs+fin+'</div><div>'+out+'</div></div>';
  $$("#out3 .tabs button").forEach(function(b){b.addEventListener("click",function(){st.fmt=b.dataset.f;renderOut3();saveRun(false,true)})});
  [$("#dlPdf"),$("#dlPdf2")].forEach(function(d){if(d)d.addEventListener("click",function(){download("/api/trial/pdf")})});
  var cm=$("#cpMail");if(cm)cm.addEventListener("click",function(){copy(emailParts().body,"Email body copied");logEv("email_copied")});
  var cs=$("#cpSubj");if(cs)cs.addEventListener("click",function(){copy(emailParts().subj,"Subject copied")});
  var f=$("#finish");if(f)f.addEventListener("click",finish);
  bindLocks($("#out3"));
  renderExport();onOut3();
}
function download(path){
  st.dl=true;clearTimeout(saveT);toast("Preparing your file...");
  saveRun(true).then(function(){var a=document.createElement("a");a.href=path+"?run_id="+encodeURIComponent(st.runId);a.download="";document.body.appendChild(a);a.click();document.body.removeChild(a)});
}
function finish(){
  clearTimeout(saveT);
  saveRun(true).then(function(){return post("/api/trial/finish",{run_id:st.runId,active_ms:Date.now()-st.t0})}).then(function(r){
    if(!r.ok){toast(r.json.error||"Could not finish. Try again.");return}
    st.finished=true;var dur=r.json.durationMs||(Date.now()-st.t0),p=pricing();
    renderOut3();
    var left=st.total-st.usedTries;
    $("#done").innerHTML='<div class="done-card"><div><span class="eyebrow" style="color:rgba(255,255,255,.7)">Try '+st.tryNo+' complete</span><h3>From email to quotation in '+fmtDur(dur)+'.</h3></div>'
    +'<div class="done-stats"><div><b>'+(cur.fields.length+cur.special.length+1)+'</b><span>details pulled from the email</span></div><div><b>'+quote.lines.length+'</b><span>charges itemised</span></div><div><b>'+money(p.final,quote.currency)+'</b><span>quoted to your client</span></div><div><b>~15 min</b><span>typical by hand (estimate)</span></div></div>'
    +'<div style="display:flex;gap:12px;flex-wrap:wrap">'+(left>0?'<button class="btn btn-primary" id="again" type="button">Start try '+(st.usedTries+1)+' of '+st.total+'</button>':'<span class="pill">Both tries used. Thank you.</span>')+'<a class="btn btn-ghost" href="#export">Get the Excel</a><a class="btn btn-ghost" href="#what">See what else is inside</a></div></div>';
    var a=$("#again");if(a)a.addEventListener("click",resetCycle);
    updateRail();paintTries();
  });
}
function resetCycle(){
  st.mTouched=false;st.dl=false;st.runId=null;st.tryNo=0;st.parsed1=false;st.parsed2=false;st.finished=false;st.pick=null;st.file=null;st.file2=null;st.carrText="";quote=null;cur=null;srcText="";
  $("#bodyIn").value="";$("#dropTxt").textContent=DROP_DEFAULT;
  $("#out1").innerHTML='<div class="placeholder"><span class="eyebrow">What appears here</span><b>The request, as a clean record</b><p>Pick a sample or add your own email to start try '+(st.usedTries+1)+'.</p></div>';
  $("#reply1").innerHTML="";$("#out2").innerHTML=$("#out2").dataset.ph;$("#markup2").innerHTML="";$("#out3").innerHTML=ph3;$("#done").innerHTML="";
  renderIn2();renderExport();renderSamples();ready1();updateRail();paintTries();$("#s1").scrollIntoView({behavior:reduced()?"auto":"smooth"});
}
function paintTries(){$("#triesPill").textContent=st.usedTries>=st.total&&(!st.runId||st.finished)?"Both tries used":"Try "+Math.max(1,st.runId?st.tryNo:st.usedTries+1)+" of "+st.total}
function updateRail(){
  $$("#rail a").forEach(function(a){var n=Number(a.dataset.s),d=(n===1&&st.parsed1)||(n===2&&st.parsed2)||(n===3&&st.finished);a.classList.toggle("done",d);var i=$("i",a);i.innerHTML=d?ICON.check.replace('width="18" height="18"','width="13" height="13"'):String(n)});
}
if("IntersectionObserver" in window){
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){$$("#rail a").forEach(function(a){if(a.getAttribute("href")==="#"+e.target.id)a.setAttribute("aria-current","step");else a.removeAttribute("aria-current")})}})},{rootMargin:"-35% 0px -55% 0px"});
  ["s1","s2","s3"].forEach(function(id){io.observe($("#"+id))});
}

/* ---------- excel export ---------- */
var SHEETS=["Summary","Request","Carrier quote","Quotation","Reply"];
function fld(k){var f=cur.fields.filter(function(x){return x[0]===k})[0];return f&&f[1]?f[1]:"Not given"}
function sheetData(n){
  var p=pricing(),s=cur,c=quote,cu=c.currency,L=rl(s.mode),pct=p.final?(p.markup/p.final*100):0,cap=function(x){return x.charAt(0)+x.slice(1).toLowerCase()};
  if(n==="Summary")return {cols:["Item","Value"],rows:[["Quotation no.",quoteNo()],["Date",fmtDate(new Date())],["Mode",s.mode],[cap(L[0]),s.route.from],[cap(L[1]),s.route.to],["Cargo",fld("Cargo")],["Incoterm",fld("Incoterm")],["Carrier",c.name+" ("+c.ref+")"],["Carrier total ("+cu+")",money(p.base,cu)],["Your markup ("+cu+")",money(p.markup,cu)],["Quoted to client ("+cu+")",money(p.final,cu)],["Margin on selling price",pct.toFixed(1)+"%"],["Transit time",c.transit],["Free time",c.free],["Valid until",fmtDate(c.quoteValid)],["Flags raised (warnings)",String(c.flags.filter(function(f){return f[0]==="warn"}).length)],["Still missing from request",s.missing.length?s.missing.join("; "):"Nothing"]]};
  if(n==="Request"){var r=[["Mode",s.mode],[cap(L[0]),s.route.from+(s.route.fc?", "+s.route.fc:"")],[cap(L[1]),s.route.to+(s.route.tc?", "+s.route.tc:"")]].concat(s.fields.map(function(f){return [f[0],f[1]||"Not given"]}));
    s.special.forEach(function(x){r.push(["Special requirement",x])});s.missing.forEach(function(x){r.push(["Missing",x])});r.push(["AI confidence",s.conf+"% ("+s.confL+")"]);r.push(["Sender",s.sender]);return {cols:["Field","Value"],rows:r}}
  if(n==="Carrier quote"){var q=c.lines.map(function(l){return [l.label,l.basis,String(l.qty),money(l.unit,cu),money(l.amount,cu)]});q.push(["Carrier total","","","",money(p.base,cu)]);c.flags.forEach(function(f){q.push(["Flag: "+(f[0]==="warn"?"Warning":f[0]==="ok"?"OK":"Note"),f[1],"","",""])});return {cols:["Charge","Basis","Qty","Unit price","Amount"],rows:q}}
  if(n==="Quotation"){var z=p.lines.map(function(l){return [l.label,l.basis,String(l.qty),money(l.amount,cu)]});z.push(["Total","","",money(p.final,cu)]);z.push(["Valid until","","",fmtDate(c.quoteValid)]);return {cols:["Description","Basis","Qty","Amount"],rows:z}}
  var e=emailParts();
  return {cols:["Item","Text"],rows:[["Suggested reply",s.reply||"No reply needed. The request was complete."],["Quotation email subject",e.subj],["Quotation email body",e.body]]};
}
function renderExport(){
  var box=$("#exp");
  if(!st.parsed2||!quote){box.innerHTML='<div class="placeholder"><span class="eyebrow">What appears here</span><b>One workbook with everything</b><p>The request, the carrier quote line by line, your priced quotation and the reply, each on its own sheet. Finish step 2 to build it.</p></div>';return}
  var d=sheetData(st.sheet),file="Logistricks-"+quoteNo()+".xlsx";
  box.innerHTML='<div class="card"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:14px"><div><span class="eyebrow">Workbook preview</span><h3 style="margin-top:6px" class="mono">'+esc(file)+'</h3></div><button class="btn btn-primary" id="dlXls" type="button">'+ICON.file+' Download Excel (.xlsx)</button></div>'
  +'<div class="tabs" role="tablist" aria-label="Sheets">'+SHEETS.map(function(x){return '<button type="button" role="tab" data-sh="'+x+'" aria-selected="'+(x===st.sheet)+'">'+x+'</button>'}).join("")+'</div>'
  +'<div class="tablewrap"><table class="xl"><thead><tr>'+d.cols.map(function(c){return '<th>'+esc(c)+'</th>'}).join("")+'</tr></thead><tbody>'+d.rows.map(function(r){return '<tr>'+r.map(function(v,i){return '<td'+(i>0&&/^[A-Z]{3} [0-9,.]+$|^[0-9.]+%?$/.test(v)?' class="r"':'')+'>'+esc(v)+'</td>'}).join("")+'</tr>'}).join("")+'</tbody></table></div>'
  +'<p class="hint" style="margin-top:12px">Five sheets, formatted, with live formulas so you can change the markup in Excel.</p></div>';
  $$("#exp .tabs button").forEach(function(b){b.addEventListener("click",function(){st.sheet=b.dataset.sh;renderExport()})});
  $("#dlXls").addEventListener("click",function(){download("/api/trial/export")});
}

/* ---------- gallery ---------- */
var FEATS=[
 ["Mailbox auto-intake","Connect the inbox. Requests are read the moment they arrive, no dropping.","12 new requests read overnight","M3 7l9 6 9-6M3 7v10h18V7M3 7h18"],
 ["Auto-reply on missing info","The client gets the right question in minutes, in their language.","Reply sent in 1 min 12 s","M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"],
 ["One-click RFQ to carriers","Pick your carriers, send the request, and track who has answered.","6 carriers asked, 4 replied","M22 2 11 13M22 2l-7 20-4-9-9-4z"],
 ["Quote comparison","Every carrier on one screen with the best rate marked.","Best rate: 4,720.00","M4 20V10M10 20V4M16 20v-7M22 20H2"],
 ["Branded quotation templates","Your logo, wording and layout, as PDF or email, per mode.","Your logo on every quote","M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5"],
 ["WhatsApp and voice intake","A voice note or WhatsApp message becomes a request too.","Voice note read in 9 s","M12 1a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 11a7 7 0 0 1-14 0M12 18v4"],
 ["Approvals and roles","Route big quotes to a manager before they go out.","Waiting for approval","M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"],
 ["Win and loss reports","Margin per quote, per carrier, per client. See what you win and why you lose.","Won 38% this month","M3 3v18h18M7 14l4-4 3 3 5-6"],
 ["Expiry guard","Quotes past their validity are flagged before they are sent.","Expired 2 days ago","M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z"]
];
$("#gallery").innerHTML=FEATS.map(function(f){return '<article class="feat"><span class="lk">'+ICON.lock+'</span><div class="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="'+f[3]+'"/></svg></div><h3>'+f[0]+'</h3><p>'+f[1]+'</p><div class="mini">'+f[2]+'</div><button type="button" class="btn btn-line btn-sm lockbtn" data-feat="'+f[0]+'">Show me this</button></article>'}).join("");
bindLocks($("#gallery"));

/* ---------- roi ---------- */
function roi(){var r=Number($("#rq").value),m=Number($("#mn").value);$("#rqv").textContent=r;$("#mnv").textContent=m;var h=Math.max(0,r*(m-4)*22/60);$("#roiH").textContent=Math.round(h)+" h";$("#roiD").textContent=(h/8).toFixed(1)}
$("#rq").addEventListener("input",roi);$("#mn").addEventListener("input",roi);roi();
$("#bookBtn").addEventListener("click",openBook);

/* ---------- access line ---------- */
var NUM=["zero","one","two","three","four","five","six","seven","eight","nine","ten"];
function paintAccess(l){
  $("#heroTries").textContent=NUM[l.triesTotal]||String(l.triesTotal);
  var ft=$("#heroTries").parentNode;
  if(l.triesTotal===1)ft.innerHTML=ft.innerHTML.replace("full tries","full try");
  if(l.expiresAt){var d=Math.max(0,Math.ceil((Date.parse(l.expiresAt)-Date.now())/86400000));
    $("#heroExp").textContent=", and your access is open until "+fmtDate(l.expiresAt);
    $("#accessLine").innerHTML=' <b>Your access is open until '+esc(fmtDate(l.expiresAt))+(d>0?' ('+d+(d===1?' day':' days')+' left)':'')+'.</b>';}
}

/* ---------- tips: a chip at the bottom for 20 s, tap to open a box that stays until closed ---------- */
var tips={q:[],seen:{},active:null,timer:null};
function tipsOpenBox(){return !$("#tipBox").hidden}
function tip(id,title,body){
  if(tips.seen[id])return;tips.seen[id]=1;
  try{if(sessionStorage.getItem("tip_"+id))return;sessionStorage.setItem("tip_"+id,"1")}catch(e){}
  tips.q.push({id:id,title:title,body:body});pumpTips();
}
function pumpTips(){
  if(tips.active||!tips.q.length||tipsOpenBox())return;
  var t=tips.q.shift();tips.active=t;
  $("#tipChipT").textContent=t.title;
  var c=$("#tipChip"),bar=$("#tipBar");c.hidden=false;bar.style.animation="none";void bar.offsetWidth;bar.style.animation="";
  clearTimeout(tips.timer);tips.timer=setTimeout(function(){hideChip();tips.active=null;pumpTips()},20000);
}
function hideChip(){$("#tipChip").hidden=true;clearTimeout(tips.timer)}
$("#tipChipMain").addEventListener("click",function(e){
  e.stopPropagation();var t=tips.active;if(!t)return;hideChip();
  $("#tipBoxT").textContent=t.title;$("#tipBoxP").textContent=t.body;$("#tipBox").hidden=false;logEv("tip_open",{feature:t.title});
});
$("#tipChipX").addEventListener("click",function(){hideChip();tips.active=null;pumpTips()});
function closeBox(){if(tipsOpenBox()){$("#tipBox").hidden=true;tips.active=null;pumpTips()}}
$("#tipBoxX").addEventListener("click",closeBox);
document.addEventListener("click",function(e){if(tipsOpenBox()&&!$("#tipBox").contains(e.target)&&!$("#tipChip").contains(e.target))closeBox()});
document.addEventListener("keydown",function(e){if(e.key==="Escape"){closeBox();closeBook()}});
function onParsed1(){
  tip("reply","The AI wrote your reply too","The AI reads the email and also writes the suggested reply for you, in the sender's language.");
  tip("step2","Now the carrier's side","Step 2 is open. Paste or drop the carrier's quote and every charge is itemised, with flags where it does not match what the client asked for.");
}
function onParsed2(){
  tip("markup","Set your margin","Add a percent or a flat amount. It is spread across the lines and the price in your quotation updates as you type.");
}
var out3Shown=false;
function onOut3(){if(out3Shown)return;out3Shown=true;tip("fmt","One quotation, two formats","The PDF and the email body carry the same content. Nothing is sent from this page, you copy or download it.")}

/* ---------- next-step arrow ---------- */
function nextStep(){
  if(!st.lead)return null;
  if(!st.parsed1){
    if(!st.runId&&!triesLeftForNew())return {el:$("#what"),lbl:"See what else is inside"};
    var has=$("#bodyIn").value.trim().length>10||!!st.file;
    return has?{el:$("#parse1"),lbl:"Next: read this email"}:{el:$("#sampbar"),lbl:"Next: pick a sample or drop an email"};
  }
  if(!st.parsed2){
    var has2=(st.carrText||"").trim().length>10||!!st.file2;
    return has2?{el:$("#parse2"),lbl:"Next: read the carrier quote"}:{el:$("#drop2"),lbl:"Next: add the carrier's quote"};
  }
  if(!st.finished){
    if(!st.mTouched&&$("#mval"))return {el:$("#mval"),lbl:"Next: set your markup"};
    if(!st.dl&&($("#dlPdf")||$("#dlPdf2")))return {el:$("#dlPdf")||$("#dlPdf2"),lbl:"Next: download your quotation"};
    return {el:$("#finish")||$("#out3"),lbl:"Next: finish this try"};
  }
  if($("#again"))return {el:$("#again"),lbl:"Next: start try "+(st.usedTries+1)};
  return {el:$("#what"),lbl:"See what else is inside"};
}
var nextT=null;
function paintNext(){
  var n=st.lead?nextStep():null,b=$("#nextBtn");
  if(!n||!n.el){b.hidden=true;return}
  b.hidden=false;if($("#nextLbl").textContent!==n.lbl)$("#nextLbl").textContent=n.lbl;b.setAttribute("aria-label",n.lbl);nextT=n;
}
$("#nextBtn").addEventListener("click",function(){
  paintNext();var n=nextT;if(!n||!n.el)return;logEv("next_click",{feature:n.lbl});
  n.el.scrollIntoView({behavior:reduced()?"auto":"smooth",block:"center"});
  n.el.classList.remove("nudge");void n.el.offsetWidth;n.el.classList.add("nudge");
  setTimeout(function(){n.el.classList.remove("nudge");if(/^(TEXTAREA|INPUT|BUTTON)$/.test(n.el.tagName)){try{n.el.focus({preventScroll:true})}catch(e){}}},1700);
});

/* ---------- book now ---------- */
function openBook(){$("#bookModal").hidden=false;logEv("cta_click",{feature:"Book now"})}
function closeBook(){$("#bookModal").hidden=true}
$("#bookFab").addEventListener("click",openBook);
$("#bkX").addEventListener("click",closeBook);
$("#bookModal").addEventListener("click",function(e){if(e.target===$("#bookModal"))closeBook()});
$("#bkGo").addEventListener("click",function(){logEv("cta_click",{feature:"Choose a time"});if(BOOKING_URL)window.open(BOOKING_URL,"_blank","noopener")});

/* ---------- what each lead looks at: time per section, sent in small batches ---------- */
var SECT=["s1","s2","s3","export","what","roi"],vis={},pend={};
function startHelpers(){
  $("#nextBtn").hidden=false;$("#bookFab").hidden=false;
  setInterval(paintNext,500);paintNext();
  if("IntersectionObserver" in window){
    var iv=new IntersectionObserver(function(es){es.forEach(function(e){vis[e.target.id]=e.isIntersecting})},{rootMargin:"-40% 0px -40% 0px"});
    SECT.forEach(function(id){var el=document.getElementById(id);if(el)iv.observe(el)});
    var io2=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;
      if(e.target.id==="what")tip("gallery","Everything here is locked","These are parts of the full system. Tap any card to tell us what you want to see in your walkthrough.");
      if(e.target.id==="roi")tip("roi","Use your own numbers","Slide both bars to match your day. The result updates live.");
    })},{threshold:.35});
    ["what","roi"].forEach(function(id){io2.observe(document.getElementById(id))});
  }
  setInterval(function(){if(document.visibilityState!=="visible")return;SECT.forEach(function(id){if(vis[id])pend[id]=(pend[id]||0)+1})},1000);
  setInterval(function(){flushDwell(false)},30000);
  document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden")flushDwell(true)});
  window.addEventListener("pagehide",function(){flushDwell(true)});
  setTimeout(function(){if(!st.parsed1&&!st.busy&&$("#bodyIn").value.trim().length<10&&!st.file)tip("idle","Start with a sample","Tap any of the five samples. One is written in Arabic. It fills the email box, then you read it in one click.")},30000);
}
function flushDwell(beacon){
  var keys=Object.keys(pend);if(!keys.length)return;
  var body={type:"dwell",sections:pend};pend={};
  if(beacon&&navigator.sendBeacon){try{navigator.sendBeacon("/api/trial/event",new Blob([JSON.stringify(body)],{type:"application/json"}));return}catch(e){}}
  post("/api/trial/event",body);
}

boot();
})();
