"use strict";

const $ = id => document.getElementById(id);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const pc = n => `${Math.round(n)}%`;

const BLUEPRINTS = [
  ["Northreach","NR-01",4.9,237,150],["Lydon","LY-02",8.2,382,130],
  ["Kestrel Coast","KC-03",6.1,565,153],["Greyhaven","GH-04",11.5,704,205],
  ["Meridian","ME-05",14.6,423,263],["Orison","OR-06",7.4,248,292],
  ["Ravelin","RA-07",9.8,599,306],["Aster Vale","AV-08",5.7,758,355],
  ["Sable Basin","SB-09",12.2,351,425],["Bellwether","BW-10",7.1,512,457],
  ["Southpoint","SP-11",4.2,674,493],["Vesper Isles","VI-12",3.8,775,109]
];
const ROUTES = [[0,1],[0,5],[1,4],[1,2],[2,3],[2,4],[2,11],[3,7],[3,11],[4,5],[4,6],[4,8],[5,8],[6,7],[6,9],[7,10],[8,9],[9,10]];
const DIFFICULTY = {
  analyst:{cap:10,growth:.88,spread:.8,death:.82,limit:68000},
  director:{cap:8,growth:1,spread:1,death:1,limit:52000},
  crisis:{cap:7,growth:1.13,spread:1.18,death:1.12,limit:41000}
};
const ACTIONS = [
  ["surveillance","Surveillance surge","◎",2,"Improve detection and add research data."],
  ["isolation","Targeted isolation","▦",2,"Suppress local transmission for 4 days. Costs trust."],
  ["treatment","Medical deployment","✚",3,"Add beds, treatment stock, and recovery capacity."],
  ["cordon","Travel cordon","⇄",2,"Reduce imported and exported infection for 5 days."],
  ["research","Research grant","◇",2,"Accelerate global vaccine research."],
  ["vaccine","Vaccine campaign","⬡",3,"Immunize part of the selected population."]
];

const S = { difficulty:"director", started:false, ended:false, day:1, maxDay:60,
  cap:8, maxCap:8, trust:76, research:0, deaths:0, selected:4,
  lastCases:0, regions:[], pathogen:null, feed:[], sound:true };
let audio;

function makeRegions(){
  return BLUEPRINTS.map((b,id)=>({id,name:b[0],code:b[1],pop:b[2],x:b[3],y:b[4],population:b[2]*1e6,
    active:0,detected:0,deaths:0,recovered:0,immune:0,detection:.28,beds:b[2]*900,
    treatment:0,surveillance:0,isolation:0,cordon:0,trust:rnd(69,87),previous:0,history:[0,0,0,0,0,0,0]}));
}
function pathogen(){
  return {name:`${pick(["NOVA","CINDER","VANTA","KAPPA","ORCHID","HELIOS","MORROW"])}-${Math.floor(rnd(11,97))}`,
    r:rnd(1.04,1.16), fatal:rnd(.0034,.0062), mutation:Math.floor(rnd(16,27)), mutated:false};
}
function active(){return S.regions.reduce((a,r)=>a+r.active,0)}
function detected(){return S.regions.reduce((a,r)=>a+r.detected,0)}
function detect(r){return clamp(r.detection+r.surveillance*.18,.2,.94)}
function load(r){return r.active/Math.max(1,r.beds)}
function adjacent(id){return ROUTES.filter(x=>x.includes(id)).map(x=>x[0]===id?x[1]:x[0])}
function risk(r){const l=load(r), rate=r.active/r.population; return l>1.08||rate>.012?3:l>.55||rate>.004?2:r.active>80?1:0}
function log(text,type=""){S.feed.unshift({day:S.day,text,type});S.feed=S.feed.slice(0,26)}
function tone(kind="soft"){
  if(!S.sound)return;
  try{audio ||= new (window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();
    o.type=kind==="alert"?"sawtooth":"sine";o.frequency.value=kind==="alert"?176:kind==="success"?560:360;
    g.gain.setValueAtTime(.0001,audio.currentTime);g.gain.exponentialRampToValueAtTime(.03,audio.currentTime+.01);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+.16);
    o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.17);}catch(_){}}
function toast(title,msg,bad=false){const e=document.createElement("div");e.className=`toast${bad?" alert":""}`;e.innerHTML=`<b>${title}</b><span>${msg}</span>`;$("toastWrap").append(e);setTimeout(()=>e.remove(),3400)}

function reset(){
  const d=DIFFICULTY[S.difficulty];Object.assign(S,{started:false,ended:false,day:1,cap:d.cap,maxCap:d.cap,
    trust:S.difficulty==="crisis"?69:76,research:0,deaths:0,selected:4,regions:makeRegions(),pathogen:pathogen(),feed:[]});
  const origin=pick([1,4,5,6,8]), near=pick(adjacent(origin));
  S.regions[origin].active=Math.floor(rnd(1300,2600));S.regions[near].active=Math.floor(rnd(100,420));
  S.regions.forEach(r=>r.detected=r.active*r.detection);S.lastCases=active();
  log(`Pathogen ${S.pathogen.name} detected in ${S.regions[origin].name}.`,"alert");log("Emergency operations network activated.","warning");render();
}

function action(id){
  if(!S.started||S.ended)return;const r=S.regions[S.selected],a=ACTIONS.find(x=>x[0]===id),cost=a[3];
  if(S.cap<cost||id==="vaccine"&&S.research<100)return;
  if(id==="surveillance"&&r.surveillance>=3||id==="treatment"&&r.treatment>=3||id==="isolation"&&r.isolation>=9||id==="cordon"&&r.cordon>=8||id==="vaccine"&&r.immune>=.88)return;
  S.cap-=cost;
  if(id==="surveillance"){r.surveillance++;r.detection=clamp(r.detection+.06,0,.82);S.research=clamp(S.research+3.2,0,100);log(`Surveillance teams deployed to ${r.name}.`);toast("Surveillance online",`${r.name} will reveal more infections.`)}
  if(id==="isolation"){r.isolation=Math.min(10,r.isolation+4);r.trust=clamp(r.trust-6,0,100);S.trust=clamp(S.trust-1.4,0,100);log(`Targeted isolation ordered in ${r.name}.`,"warning");toast("Isolation order",`Spread reduced in ${r.name}; trust declined.`)}
  if(id==="treatment"){r.treatment++;r.beds+=r.pop*720;r.trust=clamp(r.trust+2.2,0,100);log(`Medical teams reached ${r.name}.`);toast("Medical capacity expanded",`${r.name} can absorb more severe cases.`)}
  if(id==="cordon"){r.cordon=Math.min(10,r.cordon+5);r.trust=clamp(r.trust-4,0,100);S.trust=clamp(S.trust-1.1,0,100);log(`Travel cordon activated around ${r.name}.`,"warning");toast("Mobility restricted",`Cross-border spread involving ${r.name} is reduced.`)}
  if(id==="research"){S.research=clamp(S.research+9,0,100);log("Emergency research grant approved.");toast("Research accelerated","Labs are closer to a deployable vaccine.")}
  if(id==="vaccine"){const before=r.immune,coverage=S.day>28?.16:.105;r.immune=clamp(r.immune+coverage*(1-r.immune),0,.92);r.trust=clamp(r.trust+2.5,0,100);const doses=(r.immune-before)*r.population;log(`${nf.format(doses)} vaccine doses delivered to ${r.name}.`);toast("Vaccination campaign",`${nf.format(doses)} residents received protection.`)}
  tone();render();
}

function advance(){
  if(!S.started||S.ended)return;const d=DIFFICULTY[S.difficulty],imports=Array(12).fill(0);let dayDeaths=0,crises=0;
  S.regions.forEach(r=>r.previous=r.active);
  S.regions.forEach(r=>{if(r.active<30)return;adjacent(r.id).forEach(id=>{const t=S.regions[id],out=r.cordon? .18:1,inc=t.cordon?.22:1,p=Math.sqrt(r.active)*.022*S.pathogen.r*d.spread*out*inc;if(Math.random()<clamp(p/5,.01,.72))imports[id]+=Math.max(2,Math.floor(p*rnd(4,11)))})});
  S.regions.forEach((r,i)=>{
    const susceptible=clamp(1-r.immune-(r.recovered/r.population)*.72,.05,1),iso=r.isolation?.47:1,compliance=.76+r.trust/420,density=.94+Math.log10(r.population/1e6+1)*.08;
    const growth=S.pathogen.r*d.growth*susceptible*iso*compliance*density;
    const local=r.active?r.active*(growth-.78)*rnd(.78,1.18):0,recover=r.active*(.075+r.treatment*.018+(r.immune>.4?.012:0))*rnd(.88,1.08);
    const overload=load(r),death=r.active*S.pathogen.fatal*d.death*(1-r.treatment*.18)*(overload>1?1+Math.min(2.2,(overload-1)*1.35):1)*rnd(.82,1.15);
    r.active=Math.max(0,r.active+local+imports[i]-recover-death);if(r.active<1.5)r.active=0;r.recovered+=recover;r.deaths+=death;dayDeaths+=death;
    r.detected+=(r.active*detect(r)-r.detected)*.55;r.history.push(r.active);r.history=r.history.slice(-14);
    if(r.isolation)r.isolation--;if(r.cordon)r.cordon--;r.trust=clamp(r.trust-(overload>.8?(overload-.8)*1.7:0)+(r.active===0?.45:.05),0,100);if(overload>1.2)crises++;
  });
  S.deaths+=dayDeaths;S.day++;
  S.research=clamp(S.research+1.05+S.regions.reduce((a,r)=>a+r.surveillance,0)*.22+S.regions.filter(r=>r.active>20).length*.06,0,100);
  const localTrust=S.regions.reduce((a,r)=>a+r.trust,0)/12;S.trust=clamp(S.trust+(localTrust-S.trust)*.045-crises*.33-(dayDeaths>2500?.7:0),0,100);
  if(!S.pathogen.mutated&&S.day>=S.pathogen.mutation){S.pathogen.mutated=true;S.pathogen.r*=rnd(1.07,1.13);S.research=Math.max(0,S.research-7);log(`${S.pathogen.name} transmission profile shifted. Research confidence reduced.`,"alert");toast("Variant detected","Transmission increased and research lost confidence.",true)}
  if(S.research>=100&&!S.feed.some(x=>x.text.includes("Vaccine platform"))){log("Vaccine platform authorized. Regional campaigns are now available.");toast("Vaccine authorized","Production is limited. Choose regions carefully.");tone("success")}
  const now=active(),delta=now-S.lastCases;if(imports.some(x=>x>12)){const i=imports.indexOf(Math.max(...imports));log(`New transmission cluster detected in ${S.regions[i].name}.`,"warning")}
  if(dayDeaths>1000)log(`${nf.format(dayDeaths)} fatalities recorded in the last 24 hours.`,"alert");if(delta<-Math.max(100,now*.05))log("Global active infections are falling.");
  S.maxCap=Math.max(5,d.cap-(crises>=3?1:0)+(S.trust>82?1:0)+(S.research>=100&&S.day>28?1:0));S.cap=S.maxCap;S.lastCases=now;outcome();render();tone(delta>0?"alert":"soft");
}

function outcome(){const d=DIFFICULTY[S.difficulty],a=active();
  if(S.deaths>=d.limit)return finish(false,"Fatality threshold exceeded","Preventable deaths passed the mission limit and the network lost authority.");
  if(S.trust<=0)return finish(false,"Public mandate collapsed","Regions stopped complying with central directives.");
  if(a<=8&&S.day>10)return finish(true,"Transmission chain broken",`After ${S.day} days, ${S.pathogen.name} no longer has sustained transmission.`);
  if(S.day>S.maxDay){const win=a<2500&&S.research>=100;finish(win,win?"Endemic threat contained":"Response window expired",win?"Vaccination and surveillance now prevent renewed exponential spread.":"The pathogen established reservoirs beyond the network's control.")}}
function finish(win,title,text){S.ended=true;$("modalTitle").textContent=title;$("modalText").textContent=text;$("difficultyBlock").style.display="none";$("closeHelpBtn").style.display="none";$("startBtn").style.display="inline-block";$("startBtn").textContent=win?"Run another scenario":"Reconstitute command";$("startBtn").dataset.restart="true";$("briefingModal").classList.add("open");tone(win?"success":"alert")}

function renderMap(){
  $("routesLayer").innerHTML=ROUTES.map(([a,b])=>{const x=S.regions[a],y=S.regions[b],hot=x.active>300&&y.active>20||y.active>300&&x.active>20;return `<line class="route${hot?" hot":""}" x1="${x.x}" y1="${x.y}" x2="${y.x}" y2="${y.y}"/>`}).join("");
  $("citiesLayer").innerHTML=S.regions.map(r=>{const left=r.x>690,x=left?-12:12,anchor=left?"end":"start",n=r.detected<10?"<10":nf.format(r.detected);return `<g class="city-node level-${risk(r)}${r.id===S.selected?" selected":""}" data-id="${r.id}" transform="translate(${r.x} ${r.y})"><circle class="hit" r="30"/><circle class="pulse" r="9"/><circle class="ring" r="9"/><circle class="core" r="4"/><text class="city-label" x="${x}" y="-2" text-anchor="${anchor}">${r.name}</text><text class="city-count" x="${x}" y="10" text-anchor="${anchor}">${n} detected</text></g>`}).join("");
  document.querySelectorAll(".city-node").forEach(n=>n.onclick=()=>{S.selected=+n.dataset.id;tone();render()});
}
function renderStats(){const d=DIFFICULTY[S.difficulty],a=active(),delta=a-S.lastCases,stress=S.regions.reduce((s,r)=>s+Math.min(180,load(r)*100)*r.pop,0)/S.regions.reduce((s,r)=>s+r.pop,0);
  $("strainTag").textContent=`// ${S.pathogen.name}`;$("globalCases").textContent=nf.format(detected());$("caseDelta").textContent=S.day===1?"Initial estimate":`${delta>=0?"+":""}${nf.format(delta)} estimated today`;
  $("globalDeaths").textContent=nf.format(S.deaths);$("deathLimit").textContent=`Limit ${nf.format(d.limit)}`;$("hospitalStress").textContent=pc(stress);$("globalTrust").textContent=pc(S.trust);$("researchValue").textContent=pc(S.research);
  $("researchStage").textContent=S.research>=100?"Vaccine authorized":S.research>70?"Clinical validation":S.research>35?"Candidate development":"Characterizing pathogen";$("dayValue").innerHTML=`${S.day}<span>/ ${S.maxDay}</span>`;$("capacityValue").innerHTML=`${S.cap} <span>OC</span>`;
  const spent=S.maxCap-S.cap;$("capacityMeter").style.width=`${spent/S.maxCap*100}%`;$("capacityLabel").textContent=`${spent} / ${S.maxCap}`;$("deathObjective").textContent=S.deaths>d.limit*.7?"Critical":S.deaths>d.limit*.35?"At risk":"Stable";$("trustObjective").textContent=S.trust<25?"Critical":S.trust<50?"At risk":"Stable";$("caseObjective").textContent=a<=8?"Complete":"Active";
}
function forecast(r){const c=$("sparkline"),ctx=c.getContext("2d"),v=r.history.slice(-7),max=Math.max(20,...v)*1.08;ctx.clearRect(0,0,c.width,c.height);ctx.strokeStyle="rgba(139,191,179,.14)";for(let y=12;y<c.height;y+=18){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(c.width,y);ctx.stroke()}ctx.strokeStyle=r.active>r.previous?"#ff8a83":"#67e5c2";ctx.lineWidth=2;ctx.beginPath();v.forEach((n,i)=>{const x=3+i*(c.width-6)/6,y=c.height-5-n/max*(c.height-14);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();const trend=v[6]-v[3],unc=1-detect(r);$("forecastBadge").textContent=unc>.45?"Low confidence":trend>0?"Rising":"Falling";$("forecastCopy").textContent=unc>.45?"Hidden transmission may be materially higher. Surveillance would narrow the estimate.":trend>0?"Current directives are not sufficient to reverse regional growth.":"Existing measures are reducing the projected caseload."}
function renderRegion(){const r=S.regions[S.selected],l=load(r)*100,labels=["Controlled","Watch","Severe","Critical"];
  $("regionCode").textContent=r.code;$("regionName").textContent=r.name;$("regionPopulation").textContent=`Population ${r.pop.toFixed(1)} million`;$("riskPill").textContent=labels[risk(r)];$("regionCases").textContent=nf.format(r.detected);$("regionTrueCases").textContent=detect(r)>.8?nf.format(r.active):`~${nf.format(r.active)}`;
  const delta=r.active-r.previous;$("regionDelta").textContent=`${delta>=0?"+":""}${nf.format(delta)}`;$("regionImmune").textContent=pc(r.immune*100);$("hospitalLabel").textContent=pc(l);$("hospitalMeter").style.width=`${clamp(l,0,100)}%`;$("detectionLabel").textContent=pc(detect(r)*100);$("detectionMeter").style.width=`${detect(r)*100}%`;$("localTrustLabel").textContent=pc(r.trust);$("localTrustMeter").style.width=`${r.trust}%`;
  $("selectedSummaryName").textContent=r.name;$("selectedSummaryText").textContent=r.active?`${nf.format(r.detected)} detected cases. ${l>100?"Hospitals are overloaded.":"Hospitals remain functional."}`:"No active transmission detected. Maintain vigilance.";
  const tags=[];if(r.surveillance)tags.push(`<span class="tag">◎ Surveillance ${r.surveillance}/3</span>`);if(r.treatment)tags.push(`<span class="tag">✚ Medical tier ${r.treatment}</span>`);if(r.isolation)tags.push(`<span class="tag warn">▦ Isolation ${r.isolation}d</span>`);if(r.cordon)tags.push(`<span class="tag warn">⇄ Cordon ${r.cordon}d</span>`);if(r.immune>.01)tags.push(`<span class="tag">⬡ Immune ${pc(r.immune*100)}</span>`);$("measureTags").innerHTML=tags.length?tags.join(""):`<span class="panel-kicker">No active directives in this region.</span>`;forecast(r);
}
function renderActions(){const r=S.regions[S.selected];$("actionGrid").innerHTML=ACTIONS.map(a=>{const [id,title,icon,cost,desc]=a;let disabled=!S.started||S.ended||S.cap<cost||id==="vaccine"&&S.research<100||id==="surveillance"&&r.surveillance>=3||id==="treatment"&&r.treatment>=3||id==="isolation"&&r.isolation>=9||id==="cordon"&&r.cordon>=8||id==="vaccine"&&r.immune>=.88;return `<button class="action-card" data-action="${id}" ${disabled?"disabled":""}><span class="action-cost">${cost} OC</span><span class="action-icon">${icon}</span><div class="action-title">${title}</div><div class="action-desc">${desc}</div>${id==="vaccine"&&S.research<100?'<div class="action-lock">Unlocks at 100% research</div>':""}</button>`}).join("");document.querySelectorAll(".action-card").forEach(b=>b.onclick=()=>action(b.dataset.action));$("endDayBtn").disabled=!S.started||S.ended;$("turnHint").textContent=S.cap?`${S.cap} OC remains. Unspent capacity does not carry over.`:"Capacity exhausted. Advance the day."}
function render(){if(!S.regions.length)return;renderStats();renderMap();renderRegion();renderActions();$("feedList").innerHTML=S.feed.map(x=>`<div class="feed-item ${x.type}"><div class="feed-time">Day ${x.day}</div><div class="feed-text">${x.text}</div></div>`).join("")}
function help(){$("modalTitle").textContent="Command briefing";$("modalText").textContent="Select a region, spend Operations Capacity, then advance the day. Isolation and cordons reduce spread but erode trust. Medical deployments prevent deaths. Surveillance reveals hidden infections and advances research. At 100% research, vaccination becomes available.";$("difficultyBlock").style.display="none";$("startBtn").style.display="none";$("closeHelpBtn").style.display="inline-block";$("briefingModal").classList.add("open")}

document.querySelectorAll(".difficulty-btn").forEach(b=>b.onclick=()=>{document.querySelectorAll(".difficulty-btn").forEach(x=>x.classList.remove("active"));b.classList.add("active");S.difficulty=b.dataset.difficulty;reset()});
$("startBtn").onclick=e=>{if(e.currentTarget.dataset.restart){e.currentTarget.dataset.restart="";$("difficultyBlock").style.display="block";e.currentTarget.textContent="Assume command";reset()}S.started=true;S.ended=false;$("briefingModal").classList.remove("open");render();tone("success")};
$("closeHelpBtn").onclick=()=>{$("briefingModal").classList.remove("open");$("startBtn").style.display="inline-block";$("closeHelpBtn").style.display="none"};
$("endDayBtn").onclick=advance;$("helpBtn").onclick=help;$("restartBtn").onclick=()=>{S.started=false;$("modalTitle").textContent="Reconstitute command?";$("modalText").textContent="The current scenario will be discarded and a new pathogen generated.";$("difficultyBlock").style.display="block";$("startBtn").style.display="inline-block";$("startBtn").textContent="Start new scenario";$("startBtn").dataset.restart="true";$("closeHelpBtn").style.display="none";$("briefingModal").classList.add("open")};
$("soundBtn").onclick=e=>{S.sound=!S.sound;e.currentTarget.textContent=S.sound?"♪":"×";if(S.sound)tone()};
reset();
