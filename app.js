'use strict';

let db={records:[],settings:{}};
let currentMonth=new Date().toISOString().slice(0,7);
let semesterCursor={year:new Date().getFullYear(),half:(new Date().getMonth()<6?1:2)};
let weekCursor=new Date(); weekCursor.setHours(12,0,0,0);
let yearCursor=new Date().getFullYear();
let currentPdfImport=null;

const defs={
  sp:{g:'sp-g',p:'sp-p',mode:'lordo',pct:50,pctKey:'aSp',tax:'tSp'},
  vt:{g:'vt-g',p:'vt-p',mode:'raccolta',pct:4.5,pctKey:'aVt',tax:'tVt'},
  aw:{g:'aw-g',p:'aw-p',mode:'raccolta',pct:5.5,pctKey:'aAw',tax:'tAw'},
  so:{g:'so-g',p:'so-p',mode:'lordo',pct:50,pctKey:'aSo',tax:'tSo'},
  vo:{g:'vo-g',p:'vo-p',mode:'raccolta',pct:4.5,pctKey:'aVo',tax:'tVo'},
  co:{g:'co-g',p:'co-p',mode:'lordo',pct:50,pctKey:'aCo',tax:'tCo'},
  po:{g:'po-g',p:'po-p',mode:'lordo',pct:50,pctKey:'aPo',tax:'tPo'}
};

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const num=v=>{
  if(typeof v==='number') return Number.isFinite(v)?v:0;
  const s=String(v??'').trim().replace(/\s/g,'');
  if(!s) return 0;
  if(s.includes(',')&&s.includes('.')) return Number(s.replace(/\./g,'').replace(',','.'))||0;
  if(s.includes(',')) return Number(s.replace(',','.'))||0;
  return Number(s)||0;
};
const eur=v=>Number(v||0).toLocaleString('it-IT',{style:'currency',currency:'EUR'});
const dmy=s=>s?new Date(s+'T12:00:00').toLocaleDateString('it-IT'):'—';
const monthLabel=m=>new Date(m+'-01T12:00:00').toLocaleDateString('it-IT',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase());
const tone=(v,kind)=>v<0?'negative':kind==='netto'&&v>0?'positive':kind==='lordo'&&v>0?'lordo-positive':'zero';

function calc(g,p,d){
  g=num(g); p=num(p);
  const lordo=g-p;
  const pct=db.settings[d.pctKey]===undefined?d.pct:num(db.settings[d.pctKey]);
  const aggio=d.mode==='lordo'?lordo*(pct/100):g*(pct/100);
  const taxes=aggio*(num(db.settings[d.tax])/100);
  return {g,p,lordo,netto:aggio-taxes};
}
function aggregate(records){
  const cats={};
  for(const [k,d] of Object.entries(defs)){
    const g=records.reduce((s,r)=>s+num(r[d.g]),0);
    const p=records.reduce((s,r)=>s+num(r[d.p]),0);
    cats[k]=calc(g,p,d);
  }
  return {cats,conti:records.reduce((s,r)=>s+num(r.conti),0)};
}
function onlineTotal(a){
  return ['so','vo','co','po'].reduce((o,k)=>{const c=a.cats[k];o.g+=c.g;o.p+=c.p;o.lordo+=c.lordo;o.netto+=c.netto;return o},{g:0,p:0,lordo:0,netto:0});
}
function agencyTotal(a){
  const s=a.cats.sp,v=a.cats.vt;
  return {g:s.g+v.g,p:s.p+v.p,lordo:s.lordo+v.lordo,netto:s.netto+v.netto};
}
function isoLocal(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function latestDate(){return db.records.length?db.records.at(-1).data:isoLocal(new Date())}

function getPeriod(){
  const type=$('#periodType').value;
  const today=new Date(); today.setHours(12,0,0,0);
  if(type==='today'){
    const day=isoLocal(today); return {type,label:`Oggi · ${dmy(day)}`,records:db.records.filter(r=>r.data===day)};
  }
  if(type==='day'){
    const day=$('#specificDay')?.value||latestDate(); return {type,label:dmy(day),records:db.records.filter(r=>r.data===day)};
  }
  if(type==='range'){
    const from=$('#rangeFrom')?.value||latestDate(),to=$('#rangeTo')?.value||latestDate();
    return {type,label:`${dmy(from)} — ${dmy(to)}`,records:db.records.filter(r=>r.data>=from&&r.data<=to)};
  }
  if(type==='all') return {type,label:'Cumulato totale',records:[...db.records]};
  if(type==='currentWeek'){
    const d=new Date(weekCursor),dow=(d.getDay()+6)%7;d.setDate(d.getDate()-dow);
    const from=isoLocal(d);d.setDate(d.getDate()+6);const to=isoLocal(d);
    return {type,label:`${dmy(from)} — ${dmy(to)}`,records:db.records.filter(r=>r.data>=from&&r.data<=to)};
  }
  if(type==='currentYear'){
    const y=yearCursor,from=`${y}-01-01`,to=`${y}-12-31`;
    return {type,label:String(y),records:db.records.filter(r=>r.data>=from&&r.data<=to)};
  }
  if(type==='semester'){
    const y=semesterCursor.year,first=semesterCursor.half===1;
    const from=`${y}-${first?'01':'07'}-01`,to=`${y}-${first?'06-30':'12-31'}`;
    return {type,label:`${first?'1°':'2°'} semestre ${y}`,records:db.records.filter(r=>r.data>=from&&r.data<=to)};
  }
  let month;
  if(type==='specificMonth') month=$('#specificMonth')?.value||currentMonth;
  else if(type==='previousMonth'){
    const d=new Date(today.getFullYear(),today.getMonth()-1,1,12);month=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }else month=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  currentMonth=month;
  return {type,label:monthLabel(month),records:db.records.filter(r=>r.data.startsWith(month))};
}
function renderPeriodExtra(){
  const type=$('#periodType').value,host=$('#periodExtra');
  if(type==='specificMonth'){
    const opts=[];for(let y=2025;y<=2032;y++)for(let m=1;m<=12;m++){
      const val=`${y}-${String(m).padStart(2,'0')}`;opts.push(`<option value="${val}" ${val===currentMonth?'selected':''}>${monthLabel(val)}</option>`);
    }
    host.innerHTML=`<label>Mese<select id="specificMonth">${opts.join('')}</select></label>`;
  }else if(type==='day') host.innerHTML=`<label>Data<input id="specificDay" type="date" value="${latestDate()}"></label>`;
  else if(type==='range'){
    const last=latestDate(),first=last.slice(0,8)+'01';
    host.innerHTML=`<div class="date-range"><label>Dal<input id="rangeFrom" type="date" value="${first}"></label><label>Al<input id="rangeTo" type="date" value="${last}"></label></div>`;
  }else host.innerHTML='';
  host.querySelectorAll('input,select').forEach(el=>el.addEventListener('change',renderDashboard));
}
function shiftPeriod(delta){
  const type=$('#periodType').value;
  if(type==='all') return;
  if(type==='today'){
    const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+delta);$('#periodType').value='day';renderPeriodExtra();$('#specificDay').value=isoLocal(d);renderDashboard();return;
  }
  if(type==='day'){
    const el=$('#specificDay');if(!el)return;const d=new Date(el.value+'T12:00:00');d.setDate(d.getDate()+delta);el.value=isoLocal(d);renderDashboard();return;
  }
  if(type==='currentWeek'){weekCursor.setDate(weekCursor.getDate()+delta*7);renderDashboard();return;}
  if(type==='semester'){
    if(delta<0){if(semesterCursor.half===2)semesterCursor.half=1;else{semesterCursor.year--;semesterCursor.half=2}}
    else{if(semesterCursor.half===1)semesterCursor.half=2;else{semesterCursor.year++;semesterCursor.half=1}}
    renderDashboard();return;
  }
  if(type==='currentYear'){yearCursor+=delta;renderDashboard();return;}
  if(type==='range'){
    const f=$('#rangeFrom'),t=$('#rangeTo');if(!f||!t||!f.value||!t.value)return;
    const from=new Date(f.value+'T12:00:00'),to=new Date(t.value+'T12:00:00');const days=Math.max(1,Math.round((to-from)/86400000)+1);
    from.setDate(from.getDate()+delta*days);to.setDate(to.getDate()+delta*days);f.value=isoLocal(from);t.value=isoLocal(to);renderDashboard();return;
  }
  const sourceMonth=type==='specificMonth'?($('#specificMonth')?.value||currentMonth):type==='previousMonth'?(()=>{const d=new Date();d.setMonth(d.getMonth()-1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`})():currentMonth;
  const [y,m]=sourceMonth.split('-').map(Number),d=new Date(y,m-1+delta,1,12);
  currentMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;$('#periodType').value='specificMonth';renderPeriodExtra();$('#specificMonth').value=currentMonth;renderDashboard();
}

function kv(c,played='Giocato'){
  return `<div class="kv"><div><span>${played}</span><b>${eur(c.g)}</b></div><div><span>Pagato</span><b>${eur(c.p)}</b></div><div><span>Lordo</span><b class="${tone(c.lordo,'lordo')}">${eur(c.lordo)}</b></div><div><span>Netto</span><b class="${tone(c.netto,'netto')}">${eur(c.netto)}</b></div></div>`;
}
function currentMonthSportUtile(){
  const today=new Date();
  const month=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  const todayIso=isoLocal(today);
  return db.records
    .filter(r=>r.data.startsWith(month) && r.data<=todayIso)
    .reduce((sum,r)=>sum + num(r['sp-g']) - num(r['sp-p']),0);
}
function renderDashboard(){
  const p=getPeriod(),a=aggregate(p.records),agency=agencyTotal(a),online=onlineTotal(a),utileMese=currentMonthSportUtile();
  $('#periodKind').textContent=p.type==='all'?'ARCHIVIO COMPLETO':'PERIODO IN VISTA';
  $('#periodTitle').textContent=p.label;
  $('#dayCount').textContent=`${p.records.length} ${p.records.length===1?'giorno':'giorni'}`;
  $('#kpiGrid').innerHTML=`
    <article class="kpi"><span>TOTALE GIOCATO</span><strong>${eur(agency.g)}</strong><small>Sport + Virtual Agenzia</small></article>
    <article class="kpi"><span>TOTALE PAGATO</span><strong>${eur(agency.p)}</strong><small>Sport + Virtual Agenzia</small></article>
    <article class="kpi orange"><span>LORDO</span><strong class="${tone(agency.lordo,'lordo')}">${eur(agency.lordo)}</strong><small>Giocato − Pagato</small></article>
    <article class="kpi sport-profit"><span>UTILE SPORT MESE</span><strong class="${tone(utileMese,'netto')}">${eur(utileMese)}</strong><small>Dal 1° del mese a oggi</small></article>`;
  $('#sportDetail').innerHTML=kv(a.cats.sp);
  $('#virtualDetail').innerHTML=kv(a.cats.vt);
  $('#vltDetail').innerHTML=kv(a.cats.aw,'Incassati');
  $('#onlineDetail').innerHTML=kv(online);
  $('#accountsTotal').textContent=a.conti;
  renderRecent(p.records);
  drawChart(p.records);
}
function renderRecent(records){
  const rs=[...records].sort((a,b)=>b.data.localeCompare(a.data)).slice(0,7);
  $('#recentDays').innerHTML=rs.length?`<div class="recent-table"><div class="recent-row head"><b>Data</b><b>Sport</b><b>Virtual</b></div>${rs.map(r=>{
    const a=aggregate([r]);return `<div class="recent-row"><b>${dmy(r.data).slice(0,5)}</b><div class="recent-cell"><span>G ${eur(a.cats.sp.g)}</span><b>N ${eur(a.cats.sp.netto)}</b></div><div class="recent-cell"><span>G ${eur(a.cats.vt.g)}</span><b>N ${eur(a.cats.vt.netto)}</b></div></div>`;
  }).join('')}</div>`:'<p class="empty-state">Nessun dato nel periodo selezionato.</p>';
}
function drawChart(records){
  const canvas=$('#trendChart');
  const ctx=canvas.getContext('2d');

  const host=canvas.parentElement;
  const rect=host.getBoundingClientRect();
  const cssW=Math.max(600,Math.round(rect.width));
  const cssH=Math.max(300,Math.round(rect.height));
  const dpr=Math.min(3,Math.max(2,window.devicePixelRatio||1));

  canvas.style.width=cssW+'px';
  canvas.style.height=cssH+'px';
  canvas.width=Math.round(cssW*dpr);
  canvas.height=Math.round(cssH*dpr);

  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssW,cssH);
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';

  const w=cssW,h=cssH;
  const byDay={};
  for(const r of records){
    const d=Number(r.data.slice(-2)),a=aggregate([r]),t=agencyTotal(a);
    byDay[d]={g:t.g,p:t.p,n:t.netto};
  }
  const pts=Object.entries(byDay)
    .map(([d,v])=>({d:Number(d),...v}))
    .sort((a,b)=>a.d-b.d);

  if(!pts.length){
    ctx.fillStyle='#6d7885';
    ctx.font='600 13px Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textBaseline='middle';
    ctx.fillText('Nessun dato disponibile',22,32);
    return;
  }

  const max=Math.max(1,...pts.flatMap(x=>[Math.abs(x.g),Math.abs(x.p),Math.abs(x.n)]));
  const pad={l:78,r:24,t:24,b:44};
  const cw=w-pad.l-pad.r,ch=h-pad.t-pad.b;

  ctx.font='600 12px Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.textBaseline='middle';
  ctx.fillStyle='#7b8794';
  ctx.strokeStyle='#e3e8ec';
  ctx.lineWidth=1;

  for(let i=0;i<=5;i++){
    const y=Math.round(pad.t+ch*i/5)+0.5;
    ctx.beginPath();
    ctx.moveTo(pad.l,y);
    ctx.lineTo(w-pad.r,y);
    ctx.stroke();
    const label=Math.round(max*(1-i/5)).toLocaleString('it-IT');
    ctx.fillText(label,12,Math.round(y));
  }

  const lines=[
    ['g','#f2bd00'],
    ['p','#66727d'],
    ['n','#18a765']
  ];

  for(const [key,color] of lines){
    ctx.strokeStyle=color;
    ctx.lineWidth=3;
    ctx.lineJoin='round';
    ctx.lineCap='round';
    ctx.beginPath();
    pts.forEach((x,i)=>{
      const px=pad.l+(x.d-1)/30*cw;
      const py=pad.t+ch-(x[key]/max)*ch;
      if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
    });
    ctx.stroke();

    ctx.fillStyle=color;
    pts.forEach(x=>{
      const px=pad.l+(x.d-1)/30*cw;
      const py=pad.t+ch-(x[key]/max)*ch;
      ctx.beginPath();
      ctx.arc(px,py,4.5,0,Math.PI*2);
      ctx.fill();
      ctx.lineWidth=2;
      ctx.strokeStyle='#ffffff';
      ctx.stroke();
    });
  }

  ctx.fillStyle='#7b8794';
  ctx.font='600 12px Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.textBaseline='alphabetic';
  for(let d=1;d<=31;d+=2){
    const x=Math.round(pad.l+(d-1)/30*cw);
    ctx.fillText(String(d),x-4,h-16);
  }
}
function renderHistory(){
  const month=$('#historyMonth').value||currentMonth;
  const rs=[...db.records].filter(r=>r.data.startsWith(month)).sort((a,b)=>b.data.localeCompare(a.data));
  const total=aggregate(rs);
  $('#historyList').innerHTML=`<div class="history-summary"><div><span>Periodo</span><strong>${monthLabel(month)}</strong></div><div><span>Giornate</span><strong>${rs.length}</strong></div><div><span>Sport · Giocato</span><strong>${eur(total.cats.sp.g)}</strong></div><div><span>Sport · Utile mese</span><strong class="${tone(total.cats.sp.lordo,'netto')}">${eur(total.cats.sp.lordo)}</strong></div><div><span>Virtual · Giocato</span><strong>${eur(total.cats.vt.g)}</strong></div></div>`+rs.map(r=>{
    const a=aggregate([r]),on=onlineTotal(a),pdf=num(r.cassaAnaliticaTotale);
    return `<article class="history-card"><div class="history-head"><strong>${dmy(r.data)}</strong><span>${num(r.conti)} conti aperti${r.cassaAnaliticaTotale!==null&&r.cassaAnaliticaTotale!==undefined?` · Cassa ${eur(pdf)}`:''}</span></div><div class="history-grid"><div class="history-voice"><h4>Sport Agenzia</h4>${kv(a.cats.sp)}</div><div class="history-voice"><h4>Virtual Agenzia</h4>${kv(a.cats.vt)}</div><div class="history-voice"><h4>VLT</h4>${kv(a.cats.aw,'Incassati')}</div><div class="history-voice"><h4>Online</h4>${kv(on)}</div></div></article>`;
  }).join('');
}
function switchView(view){
  const id=view==='dashboard'?'dashboardView':view==='history'?'historyView':view==='master'?'masterView':'settingsView';
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===id));$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  if(view==='history')renderHistory();if(view==='master')renderMasterState();if(view==='settings')renderSettingsState();
}

/* ===== MASTER / GITHUB ===== */
const MASTER_PASSWORD='PlanetMaster';
const TOKEN_KEY='planetwin365_barletta_gh_token';
const MASTER_SESSION_KEY='planetwin365_barletta_master';
const GH_REPO='alexsalv2-ops/Planetwin365-Dashboard-Barletta-private';
const GH_FILE='data.json';
let githubTokenMemory='';

function getGithubToken(){
  let token='';try{token=(localStorage.getItem(TOKEN_KEY)||'').trim()}catch(e){}
  if(!token&&githubTokenMemory)token=githubTokenMemory.trim();const field=$('#settingsGithubToken');if(!token&&field?.value)token=field.value.trim();
  if(token){githubTokenMemory=token;try{if(localStorage.getItem(TOKEN_KEY)!==token)localStorage.setItem(TOKEN_KEY,token)}catch(e){}}
  return token;
}
function saveGithubToken(token){token=(token||'').trim();if(!token)return false;githubTokenMemory=token;try{localStorage.setItem(TOKEN_KEY,token)}catch(e){}return !!getGithubToken()}
function clearGithubToken(){githubTokenMemory='';try{localStorage.removeItem(TOKEN_KEY)}catch(e){}}
function isMaster(){return sessionStorage.getItem(MASTER_SESSION_KEY)==='1'}
function renderMasterState(){const u=isMaster();$('#masterLocked').hidden=u;$('#masterUnlocked').hidden=!u;if(u){loadRateFields();if(!$('#entryDate').value)$('#entryDate').value=latestDate();updateRawPreview();renderPdfSavedDetail()}}
function renderSettingsState(){const u=isMaster();$('#settingsLocked').hidden=u;$('#settingsUnlocked').hidden=!u;if(u){$('#settingsGithubToken').value=getGithubToken();updateTokenStatus();loadRateFields()}}
function updateTokenStatus(){const ok=!!getGithubToken();$('#settingsTokenStatus').textContent=ok?'Token salvato':'Token non impostato';$('#settingsTokenStatus').className='pill '+(ok?'positive':'')}
function loginFrom(inputId){if($(inputId).value===MASTER_PASSWORD){sessionStorage.setItem(MASTER_SESSION_KEY,'1');$(inputId).value='';renderMasterState();renderSettingsState()}else alert('Password Master non corretta.')}
function logoutMaster(){sessionStorage.removeItem(MASTER_SESSION_KEY);renderMasterState();renderSettingsState()}

function val(id){return num($('#'+id)?.value)}
function setVal(id,v){const el=$('#'+id);if(el)el.value=(Number(v)||0).toFixed(2).replace('.',',')}
function optionalVal(id){const raw=String($('#'+id)?.value??'').trim();return raw===''?null:num(raw)}
function setOptionalVal(id,v){const el=$('#'+id);if(el)el.value=(v===null||v===undefined||v==='')?'':Number(v).toFixed(2).replace('.',',')}
function updateRawPreview(){
  const spG=val('spEmessi')-val('spAnnulli'),spP=val('spPagati')+val('spRimborsati'),vtG=val('vtEmessi')-val('vtAnnulli'),vtP=val('vtPagati')+val('vtRimborsati');
  $('#spNetPlayed').textContent=eur(spG);$('#spNetPaid').textContent=eur(spP);if($('#spUtile'))$('#spUtile').textContent=eur(spG-spP);$('#vtNetPlayed').textContent=eur(vtG);$('#vtNetPaid').textContent=eur(vtP);
}
function recordFromForm(){
  const date=$('#entryDate').value;if(!date)throw new Error('Seleziona una data.');
  const spRaw={venduto:val('spEmessi'),annullato:val('spAnnulli'),pagato:val('spPagati'),rimborsato:val('spRimborsati')};
  const vtRaw={venduto:val('vtEmessi'),annullato:val('vtAnnulli'),pagato:val('vtPagati'),rimborsato:val('vtRimborsati')};
  const spG=spRaw.venduto-spRaw.annullato,spP=spRaw.pagato+spRaw.rimborsato;
  return {data:date,'sp-g':spG,'sp-p':spP,utileSport:spG-spP,'vt-g':vtRaw.venduto-vtRaw.annullato,'vt-p':vtRaw.pagato+vtRaw.rimborsato,'aw-g':val('awG'),'aw-p':val('awP'),'so-g':val('soG'),'so-p':val('soP'),'vo-g':val('voG'),'vo-p':val('voP'),'co-g':val('coG'),'co-p':val('coP'),'po-g':val('poG'),'po-p':val('poP'),conti:Math.max(0,Math.round(val('contiInput'))),cassaContata:optionalVal('cassaContataInput'),cassaAnaliticaTotale:optionalVal('pdfTotalInput'),planetRaw:{sport:spRaw,virtual:vtRaw},planetPdf:currentPdfImport?JSON.parse(JSON.stringify(currentPdfImport)):null,aggiornato:new Date().toISOString()};
}
function clearEntry(){
  ['spEmessi','spAnnulli','spPagati','spRimborsati','vtEmessi','vtAnnulli','vtPagati','vtRimborsati','awG','awP','soG','soP','voG','voP','coG','coP','poG','poP'].forEach(id=>setVal(id,0));
  $('#contiInput').value='0';setOptionalVal('cassaContataInput',null);setOptionalVal('pdfTotalInput',null);$('#pdfCheckInput').value='Non verificato';currentPdfImport=null;updateRawPreview();renderPdfSavedDetail();
}
function loadDayToForm(){
  const date=$('#entryDate').value,r=db.records.find(x=>x.data===date);
  if(!r){clearEntry();$('#saveStatus').textContent='Giornata non presente: pronto per nuovo inserimento.';return}
  const sr=r.planetRaw?.sport||{venduto:num(r['sp-g']),annullato:0,pagato:num(r['sp-p']),rimborsato:0};
  const vr=r.planetRaw?.virtual||{venduto:num(r['vt-g']),annullato:0,pagato:num(r['vt-p']),rimborsato:0};
  setVal('spEmessi',sr.venduto);setVal('spAnnulli',sr.annullato);setVal('spPagati',sr.pagato);setVal('spRimborsati',sr.rimborsato);
  setVal('vtEmessi',vr.venduto);setVal('vtAnnulli',vr.annullato);setVal('vtPagati',vr.pagato);setVal('vtRimborsati',vr.rimborsato);
  [['awG','aw-g'],['awP','aw-p'],['soG','so-g'],['soP','so-p'],['voG','vo-g'],['voP','vo-p'],['coG','co-g'],['coP','co-p'],['poG','po-g'],['poP','po-p']].forEach(([id,k])=>setVal(id,r[k]));
  $('#contiInput').value=Math.max(0,Math.round(num(r.conti)));setOptionalVal('cassaContataInput',r.cassaContata);setOptionalVal('pdfTotalInput',r.cassaAnaliticaTotale);currentPdfImport=r.planetPdf||null;updatePdfCheckFromImport();updateRawPreview();renderPdfSavedDetail();$('#saveStatus').textContent='Giornata caricata. Le modifiche sovrascriveranno questa data.';
}
function decodeGithubContent(content){const clean=String(content||'').replace(/\s/g,'');return JSON.parse(decodeURIComponent(escape(atob(clean))))}
async function fetchLatestGithubDb(requireToken=true){
  const token=getGithubToken();if(requireToken&&!token)throw new Error('Token GitHub non disponibile. Apri Impostazioni e salvalo sul dispositivo.');
  const headers={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};if(token)headers.Authorization=`Bearer ${token}`;
  const res=await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}?ref=main&ts=${Date.now()}`,{headers,cache:'no-store'});
  if(!res.ok)throw new Error(`GitHub: ${res.status} ${res.statusText}`);const meta=await res.json();return {db:decodeGithubContent(meta.content),sha:meta.sha};
}
function encodeGithubJson(obj){return btoa(unescape(encodeURIComponent(JSON.stringify(obj,null,2))))}
async function putGithubDb(next,sha,message){
  const token=getGithubToken();if(!token)throw new Error('Token GitHub non disponibile.');
  const res=await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}`,{method:'PUT',headers:{'Accept':'application/vnd.github+json','Authorization':`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify({message,content:encodeGithubJson(next),sha})});
  if(!res.ok){let msg='';try{msg=(await res.json()).message||''}catch{}throw new Error(`GitHub: ${res.status} ${msg}`)}
}
async function saveEntry(){
  try{
    $('#saveEntryBtn').disabled=true;$('#saveStatus').textContent='Salvataggio...';const rec=recordFromForm();const remote=await fetchLatestGithubDb(true),next=remote.db||{records:[],settings:{}};next.records=Array.isArray(next.records)?next.records:[];next.settings=next.settings||{};
    const idx=next.records.findIndex(r=>r.data===rec.data);if(idx>=0){const prev=next.records[idx];next.records[idx]={...prev,...rec,planetPdf:rec.planetPdf||prev.planetPdf||null}}else next.records.push(rec);
    next.records.sort((a,b)=>a.data.localeCompare(b.data));await putGithubDb(next,remote.sha,`Planetwin365 Barletta: salva ${rec.data}`);db=next;currentMonth=rec.data.slice(0,7);renderDashboard();renderHistory();$('#saveStatus').textContent='Giornata salvata ✓';
  }catch(e){$('#saveStatus').textContent='Errore: '+e.message}finally{$('#saveEntryBtn').disabled=false}
}
async function deleteEntry(){
  const date=$('#entryDate').value;if(!date)return;if(!confirm(`Eliminare definitivamente la giornata ${dmy(date)}?`))return;
  try{$('#deleteEntryBtn').disabled=true;$('#saveStatus').textContent='Eliminazione...';const remote=await fetchLatestGithubDb(true),next=remote.db;next.records=Array.isArray(next.records)?next.records:[];const before=next.records.length;next.records=next.records.filter(r=>r.data!==date);if(next.records.length===before)throw new Error('Giornata non presente nel database.');await putGithubDb(next,remote.sha,`Planetwin365 Barletta: elimina ${date}`);db=next;clearEntry();renderDashboard();renderHistory();$('#saveStatus').textContent='Giornata eliminata ✓'}catch(e){$('#saveStatus').textContent='Errore: '+e.message}finally{$('#deleteEntryBtn').disabled=false}
}

/* ===== IMPORT PDF PLANETWIN365 ===== */
const VIRTUAL_LABELS=['GR Racing','GR League','Inspired Virtuals','Virtual Kiron'];
function moneyFromPdf(s){return Number(String(s||'0').replace(/\./g,'').replace(',','.'))||0}
function escapeRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function parsePdfRow(text,action,label){
  const re=new RegExp(`${escapeRe(action)}\\s+${escapeRe(label)}\\s+\\d+\\s+(-?[\\d.]+,\\d{2})\\s*€`,'i');const m=text.match(re);return {found:!!m,value:m?moneyFromPdf(m[1]):0};
}
function parsePdfTotalRow(text,label){
  const re=new RegExp(`Totale\\s+${escapeRe(label)}\\s+\\d+\\s+(-?[\\d.]+,\\d{2})\\s*€`,'i');const m=text.match(re);return m?moneyFromPdf(m[1]):null;
}
function parsePlanetPdfText(rawText,fileName=''){
  const text=String(rawText||'').replace(/\s+/g,' ').trim();
  const fromM=text.match(/DA:\s*(\d{2})\/(\d{2})\/(\d{4})/i),toM=text.match(/(?:^|\s)A:\s*(\d{2})\/(\d{2})\/(\d{4})/i);if(!fromM||!toM)throw new Error('Data del report non riconosciuta.');
  const from=`${fromM[3]}-${fromM[2]}-${fromM[1]}`,to=`${toM[3]}-${toM[2]}-${toM[1]}`;if(from!==to)throw new Error('Il PDF deve essere una chiusura di una sola giornata (DA e A devono coincidere).');
  const actions=['Venduto','Annullato','Pagato','Rimborsato'];
  const sport={};for(const a of actions)sport[a.toLowerCase()]=parsePdfRow(text,a,'Sports');
  if(!sport.venduto.found)throw new Error('Riga Venduto Sports non trovata: formato PDF non riconosciuto.');
  const virtualRows={};for(const label of VIRTUAL_LABELS){virtualRows[label]={};for(const a of actions)virtualRows[label][a.toLowerCase()]=parsePdfRow(text,a,label)}
  const sumVirtual=key=>VIRTUAL_LABELS.reduce((s,l)=>s+Math.abs(virtualRows[l][key].value),0);
  const totals={venduto:parsePdfTotalRow(text,'Venduto'),annullato:parsePdfTotalRow(text,'Annullato'),pagato:parsePdfTotalRow(text,'Pagato'),rimborsato:parsePdfTotalRow(text,'Rimborsato')};
  const topMatch=text.match(/(?:^|\s)Totale\s+(-?[\d.]+,\d{2})\s*€/i),cassaTotale=topMatch?moneyFromPdf(topMatch[1]):null;
  const calcTotal=[totals.venduto,totals.annullato,totals.pagato,totals.rimborsato].every(v=>v!==null)?totals.venduto+totals.annullato+totals.pagato+totals.rimborsato:null;
  const sportNormalized={venduto:Math.abs(sport.venduto.value),annullato:Math.abs(sport.annullato.value),pagato:Math.abs(sport.pagato.value),rimborsato:Math.abs(sport.rimborsato.value)};
  const virtualNormalized={venduto:sumVirtual('venduto'),annullato:sumVirtual('annullato'),pagato:sumVirtual('pagato'),rimborsato:sumVirtual('rimborsato')};
  const utileSport=(sportNormalized.venduto-sportNormalized.annullato)-(sportNormalized.pagato+sportNormalized.rimborsato);
  return {fileName,date:from,from,to,sport:sportNormalized,virtual:virtualNormalized,utileSport,virtualRows,totals,cassaTotale,calcTotal,difference:cassaTotale!==null&&calcTotal!==null?calcTotal-cassaTotale:null};
}
async function extractPdfText(file){
  if(typeof pdfjsLib==='undefined')throw new Error('Libreria PDF non disponibile. Controlla la connessione Internet e ricarica la pagina.');
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const data=new Uint8Array(await file.arrayBuffer()),pdf=await pdfjsLib.getDocument({data}).promise;let out='';
  for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p),content=await page.getTextContent();out+=' '+content.items.map(i=>i.str).join(' ')}
  return out;
}
function updatePdfCheckFromImport(){
  const el=$('#pdfCheckInput');if(!currentPdfImport){el.value='Non verificato';el.className='';return}
  const d=currentPdfImport.difference;if(d===null||d===undefined){el.value='Totale non verificabile';el.className=''}else if(Math.abs(d)<0.011){el.value='Quadrata ✓';el.className='pdf-ok'}else{el.value=`Differenza ${eur(d)}`;el.className='pdf-error'}
}
function renderPdfSavedDetail(){
  const host=$('#pdfSavedDetail');if(!host)return;if(!currentPdfImport){host.innerHTML='';return}
  const rows=VIRTUAL_LABELS.map(l=>{const r=currentPdfImport.virtualRows?.[l];return r?`<div><strong>${l}</strong><span>Venduto ${eur(Math.abs(r.venduto.value))} · Annullato ${eur(Math.abs(r.annullato.value))} · Pagato ${eur(Math.abs(r.pagato.value))}</span></div>`:''}).join('');
  const utileSport=currentPdfImport.utileSport!==undefined?num(currentPdfImport.utileSport):(num(currentPdfImport.sport?.venduto)-num(currentPdfImport.sport?.annullato))-(num(currentPdfImport.sport?.pagato)+num(currentPdfImport.sport?.rimborsato));
  host.innerHTML=`<div><strong>PDF</strong><span>${currentPdfImport.fileName||'Cassa Analitica'} · ${dmy(currentPdfImport.date)}</span></div><div class="pdf-utile-row"><strong>Utile Sport</strong><span class="${tone(utileSport,'netto')}">${eur(utileSport)}</span></div>${rows}`;
}
function renderPdfPreview(p){
  const status=Math.abs(p.difference||0)<0.011?'✓ Chiusura quadrata':p.difference===null?'Totale non verificabile':`⚠ Differenza ${eur(p.difference)}`;
  const utileSport=p.utileSport!==undefined?num(p.utileSport):(num(p.sport?.venduto)-num(p.sport?.annullato))-(num(p.sport?.pagato)+num(p.sport?.rimborsato));
  $('#pdfImportPreview').innerHTML=`<div class="pdf-preview-card"><div class="pdf-preview-head"><strong>${dmy(p.date)}</strong><span class="${status.startsWith('✓')?'pdf-ok-text':'pdf-warn-text'}">${status}</span></div><div class="pdf-preview-grid"><div class="pdf-utile-tile"><span>Utile Sport</span><b class="${tone(utileSport,'netto')}">${eur(utileSport)}</b></div><div><span>Sport venduto</span><b>${eur(p.sport.venduto)}</b></div><div><span>Sport annullato</span><b>${eur(p.sport.annullato)}</b></div><div><span>Sport pagato</span><b>${eur(p.sport.pagato)}</b></div><div><span>Virtual venduto</span><b>${eur(p.virtual.venduto)}</b></div><div><span>Virtual annullato</span><b>${eur(p.virtual.annullato)}</b></div><div><span>Virtual pagato</span><b>${eur(p.virtual.pagato)}</b></div><div><span>Totale report</span><b>${p.cassaTotale===null?'—':eur(p.cassaTotale)}</b></div><div><span>Totale ricalcolato</span><b>${p.calcTotal===null?'—':eur(p.calcTotal)}</b></div></div></div>`;
}
async function importPdf(){
  const file=$('#pdfFile').files?.[0];if(!file){$('#pdfImportStatus').textContent='Seleziona prima il PDF di chiusura.';return}
  try{$('#importPdfBtn').disabled=true;$('#pdfImportStatus').textContent='Lettura PDF...';const text=await extractPdfText(file),p=parsePlanetPdfText(text,file.name);$('#entryDate').value=p.date;loadDayToForm();currentPdfImport=p;setVal('spEmessi',p.sport.venduto);setVal('spAnnulli',p.sport.annullato);setVal('spPagati',p.sport.pagato);setVal('spRimborsati',p.sport.rimborsato);setVal('vtEmessi',p.virtual.venduto);setVal('vtAnnulli',p.virtual.annullato);setVal('vtPagati',p.virtual.pagato);setVal('vtRimborsati',p.virtual.rimborsato);setOptionalVal('pdfTotalInput',p.cassaTotale);updateRawPreview();updatePdfCheckFromImport();renderPdfSavedDetail();renderPdfPreview(p);$('#pdfImportStatus').textContent=`PDF letto correttamente: ${dmy(p.date)}. Controlla i campi e premi Salva giornata.`}catch(e){$('#pdfImportStatus').textContent='Errore PDF: '+e.message;currentPdfImport=null}finally{$('#importPdfBtn').disabled=false}
}

/* ===== ALIQUOTE / BACKUP ===== */
const rateMap=[['rateSpAggio','aSp',50],['rateSpTax','tSp',20.5],['rateVtAggio','aVt',4.5],['rateVtTax','tVt',24.5],['rateAwAggio','aAw',5.5],['rateAwTax','tAw',20.5],['rateSoAggio','aSo',50],['rateSoTax','tSo',24.5],['rateVoAggio','aVo',4.5],['rateVoTax','tVo',24.5],['rateCoAggio','aCo',50],['rateCoTax','tCo',24.5],['ratePoAggio','aPo',50],['ratePoTax','tPo',20]];
function rateText(v){return Number(v||0).toLocaleString('it-IT',{maximumFractionDigits:3})}
function loadRateFields(){for(const [id,key,def] of rateMap){const el=$('#'+id);if(el)el.value=rateText(db.settings[key]===undefined?def:db.settings[key])}}
async function saveRates(){
  try{$('#saveRatesBtn').disabled=true;$('#ratesStatus').textContent='Salvataggio...';const remote=await fetchLatestGithubDb(true),next=remote.db;next.settings=next.settings||{};for(const [id,key] of rateMap)next.settings[key]=num($('#'+id).value);await putGithubDb(next,remote.sha,'Planetwin365 Barletta: aggiorna aliquote');db=next;renderDashboard();renderHistory();$('#ratesStatus').textContent='Aliquote salvate ✓'}catch(e){$('#ratesStatus').textContent='Errore: '+e.message}finally{$('#saveRatesBtn').disabled=false}
}
function downloadJson(obj,name){const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function exportBackup(){const stamp=new Date().toISOString().slice(0,10);downloadJson(db,`planetwin365-barletta-backup-${stamp}.json`);$('#backupStatus').textContent='Backup esportato.'}
async function pushWholeDb(next,message){const remote=await fetchLatestGithubDb(true);await putGithubDb(next,remote.sha,message)}
async function importBackup(){
  const file=$('#importBackupFile').files?.[0];if(!file){$('#backupStatus').textContent='Seleziona prima un file JSON.';return}
  try{const imported=JSON.parse(await file.text());if(!imported||!Array.isArray(imported.records)||!imported.settings)throw new Error('Backup non valido.');const stamp=new Date().toISOString().slice(0,10);downloadJson(db,`planetwin365-barletta-pre-restore-${stamp}.json`);if(!confirm(`Ripristinare il backup con ${imported.records.length} giornate?`))return;$('#importBackupBtn').disabled=true;$('#backupStatus').textContent='Ripristino...';imported.records.sort((a,b)=>a.data.localeCompare(b.data));await pushWholeDb(imported,'Planetwin365 Barletta: ripristino backup');db=imported;currentMonth=db.records.length?db.records.at(-1).data.slice(0,7):currentMonth;renderDashboard();renderHistory();loadRateFields();$('#backupStatus').textContent='Backup ripristinato ✓'}catch(e){$('#backupStatus').textContent='Errore: '+e.message}finally{$('#importBackupBtn').disabled=false}
}

async function loadData(){
  const token=getGithubToken();
  let privateDataLocked=false;

  if(token){
    try{
      db=(await fetchLatestGithubDb(true)).db;
    }catch(e){
      db={records:[],settings:{}};
      privateDataLocked=true;
      console.error(e);
    }
  }else{
    db={records:[],settings:{}};
    privateDataLocked=true;
  }

  db=db||{records:[],settings:{}};
  db.records=Array.isArray(db.records)?db.records:[];
  db.settings=db.settings||{};
  db.records.sort((a,b)=>a.data.localeCompare(b.data));
  currentMonth=db.records.length?db.records.at(-1).data.slice(0,7):new Date().toISOString().slice(0,7);
  $('#historyMonth').value=currentMonth;
  renderPeriodExtra();
  renderDashboard();
  renderMasterState();
  renderSettingsState();

  if(privateDataLocked){
    const t=$('#toast');
    if(t){
      t.textContent='Database privato: configura il token GitHub in Impostazioni per visualizzare i dati.';
      t.classList.add('show');
      setTimeout(()=>t.classList.remove('show'),6500);
    }
  }
}

/* ===== EVENTI ===== */
$('#periodType').addEventListener('change',()=>{const type=$('#periodType').value,n=new Date();n.setHours(12,0,0,0);if(type==='semester')semesterCursor={year:n.getFullYear(),half:(n.getMonth()<6?1:2)};if(type==='currentWeek')weekCursor=new Date(n);if(type==='currentYear')yearCursor=n.getFullYear();renderPeriodExtra();renderDashboard()});
$('#prevPeriod').addEventListener('click',()=>shiftPeriod(-1));$('#nextPeriod').addEventListener('click',()=>shiftPeriod(1));$('#refreshBtn').addEventListener('click',()=>location.reload());$('#historyMonth').addEventListener('change',renderHistory);$$('[data-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
$('#masterLoginBtn').addEventListener('click',()=>loginFrom('#masterPassword'));$('#masterPassword').addEventListener('keydown',e=>{if(e.key==='Enter')loginFrom('#masterPassword')});$('#settingsLoginBtn').addEventListener('click',()=>loginFrom('#settingsPassword'));$('#settingsPassword').addEventListener('keydown',e=>{if(e.key==='Enter')loginFrom('#settingsPassword')});$('#masterLogoutBtn').addEventListener('click',logoutMaster);$('#settingsLogoutBtn').addEventListener('click',logoutMaster);
$('#settingsSaveTokenBtn').addEventListener('click',()=>{if(saveGithubToken($('#settingsGithubToken').value.trim()))updateTokenStatus();else alert('Inserisci un token GitHub valido.')});$('#settingsClearTokenBtn').addEventListener('click',()=>{clearGithubToken();$('#settingsGithubToken').value='';updateTokenStatus()});
$('#loadDayBtn').addEventListener('click',loadDayToForm);$('#entryDate').addEventListener('change',()=>{if(currentPdfImport&&currentPdfImport.date!==$('#entryDate').value){currentPdfImport=null;$('#pdfCheckInput').value='Non verificato';renderPdfSavedDetail()}});$('#saveEntryBtn').addEventListener('click',saveEntry);$('#deleteEntryBtn').addEventListener('click',deleteEntry);$('#importPdfBtn').addEventListener('click',importPdf);$('#pdfFile').addEventListener('change',()=>{if($('#pdfFile').files?.[0])importPdf()});
['spEmessi','spAnnulli','spPagati','spRimborsati','vtEmessi','vtAnnulli','vtPagati','vtRimborsati'].forEach(id=>$('#'+id).addEventListener('input',updateRawPreview));
$('#saveRatesBtn').addEventListener('click',saveRates);$('#exportBackupBtn').addEventListener('click',exportBackup);$('#importBackupBtn').addEventListener('click',importBackup);
window.addEventListener('resize',()=>{if($('#dashboardView').classList.contains('active'))drawChart(getPeriod().records)});

loadData().catch(e=>{console.error(e);$('#toast').textContent=e.message;$('#toast').classList.add('show')});
