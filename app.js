const stages=['Nowy lead','Do kontaktu','Kontakt wykonany','Kwalifikacja','Oferta','Follow-up','Wygrany','Przegrany'];
let leads=[],view='dashboard';
const app=document.querySelector('#app'),title=document.querySelector('#viewTitle'),subtitle=document.querySelector('#subtitle'),crumb=document.querySelector('#crumb'),addLeadBtn=document.querySelector('#addLead'),notificationBtn=document.querySelector('#notificationBtn'),notificationPanel=document.querySelector('#notificationPanel'),notificationBadge=document.querySelector('#notificationBadge'),notificationList=document.querySelector('#notificationList'),notificationSummary=document.querySelector('#notificationSummary');
const labels={dashboard:['Pulpit','Najważniejsze informacje z Twojego biura rachunkowego.'],stats:['Statystyki','Wyniki całego zespołu lub wybranego opiekuna.'],users:['Użytkownicy','Zespół i role w CRM.'],history:['Historia zmian','Rejestr zmian w systemie.'],reminders:['Przypomnienia','Zadania i terminy wymagające działania.'],emails:['Wiadomości e-mail','Robocza skrzynka i status korespondencji.'],clients:['Klienci','Aktywni klienci biura rachunkowego.'],leads:['Leady / Potencjalni klienci','Pełna lista kontaktów sprzedażowych.'],pipeline:['Szanse sprzedaży','Zarządzaj leadami i przesuwaj je przez kolejne etapy sprzedaży.'],offers:['Oferty','Wysłane i przygotowywane oferty.'],notes:['Notatki','Notatki handlowe i operacyjne.'],automations:['Automatyzacje','Reguły automatyzujące proces sprzedaży.'],templates:['Szablony dokumentów','Gotowe dokumenty i wzory.'],sequences:['Sekwencje e-mail','Zaplanowane serie wiadomości.'],integrations:['Integracje','Połączenia z zewnętrznymi usługami.'],settings:['Ustawienia systemu','Konfiguracja CRM.']};
const money=n=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN',maximumFractionDigits:0}).format(n||0);
const overdue=d=>d&&new Date(d)<new Date(new Date().toISOString().slice(0,10));
const datePL=d=>d?new Date(d).toLocaleDateString('pl-PL'):'—';
async function api(url,opts={}){const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});if(!r.ok){let m='Błąd API';try{m=(await r.json()).error||m}catch{}throw new Error(m)}if(r.status===204)return null;return r.json()}
async function loadLeads(){leads=await api('/api/leads')}
function loading(msg='Ładowanie danych…'){app.innerHTML=`<div class="loading-card">${msg}</div>`}
function errorCard(e){app.innerHTML=`<div class="error-card"><b>Nie udało się połączyć z bazą danych.</b><span>${e.message}</span></div>`}
function initials(s=''){return s.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'--'}
function elapsed(iso){if(!iso)return'00:00:00';let sec=Math.max(0,Math.floor((Date.now()-new Date(iso).getTime())/1000));const h=String(Math.floor(sec/3600)).padStart(2,'0'),m=String(Math.floor(sec%3600/60)).padStart(2,'0'),s=String(sec%60).padStart(2,'0');return `${h}:${m}:${s}`}
async function render(){document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));const [t,s]=labels[view]||[view,''];title.textContent=t;subtitle.textContent=s;crumb.textContent=(['dashboard','stats','users','history','reminders','emails'].includes(view)?'OGÓLNE / ':'CRM / ')+t;addLeadBtn.style.display=['dashboard','pipeline','leads'].includes(view)?'inline-block':'none';loading();try{if(view==='dashboard')return await dashboard();if(view==='stats')return await statsView();if(view==='pipeline')return await pipeline();if(view==='leads')return await leadTable();return await genericModule(view)}catch(e){errorCard(e)}}
async function dashboard(){await loadLeads();const stats=await api('/api/stats');const hist=await api('/api/modules?module=history').catch(()=>[]);const active=leads.find(l=>!['Wygrany','Przegrany'].includes(l.stage))||leads[0]||null;const recent=leads.slice(0,5);const won=leads.filter(l=>l.stage==='Wygrany').slice(0,5);const today=new Date().toISOString().slice(0,10);const followups=leads.filter(l=>l.followup===today).length;const offers=leads.filter(l=>['Oferta','Follow-up'].includes(l.stage)).length;
app.innerHTML=`
<div class="dash-head"><div><h2>Dzień dobry, Anno!</h2><p>Oto najważniejsze informacje z Twojego biura rachunkowego.</p></div><div class="date-pill">▣ ${new Date().toLocaleDateString('pl-PL',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div></div>
<div class="hero-grid">
  <div class="active-lead ${active?'':'empty-state'}">
    ${active?`<div class="active-left"><div class="eyebrow">● AKTYWNY LEAD</div><div class="timer" id="liveTimer">${elapsed(active.updated_at||active.created_at)}</div><div class="timer-label">◴ Czas od ostatniej aktywności</div><div class="hero-chips"><span>▣ Ostatni kontakt: ${datePL(active.updated_at||active.created_at)}</span><span>♙ Opiekun: ${active.owner||'Nieprzypisany'}</span></div></div><div class="active-right"><div><h3>${active.company}</h3><p>${active.email||active.phone||'Brak danych kontaktowych'}</p></div><div class="stage-block"><span>Etap w sprzedaży</span><b>${active.stage}</b></div><button class="contact-btn" data-action="contact">☎ Skontaktuj się</button></div>`:`<div class="empty-lead"><b>Brak aktywnych leadów</b><span>Dodaj pierwszego leada, aby rozpocząć pracę.</span><button class="contact-btn" data-action="new-lead">+ Dodaj lead</button></div>`}
  </div>
  <div class="side-card"><div class="side-title"><h3>Ulubieni klienci</h3><button data-view-link="clients">Zobacz wszystkich →</button></div>${(won.length?won:recent).map((l,i)=>clientRow(l,i===0)).join('')||'<div class="mini-empty">Brak klientów</div>'}</div>
</div>
<div class="section-row"><div><h3>Wybierz czynność</h3></div><span>Szybkie akcje do codziennej pracy w CRM.</span></div>
<div class="actions-grid">
 ${actionTile('new-lead','♙','Dodaj lead','Wprowadź nowego potencjalnego klienta',true)}
 ${actionTile('task','✓','Dodaj zadanie','Ustaw zadanie dla siebie lub zespołu')}
 ${actionTile('meeting','▣','Umów spotkanie','Zaplanuj rozmowę z klientem')}
 ${actionTile('message','➤','Wyślij wiadomość','Napisz e-mail do klienta')}
 ${actionTile('onboarding','♧','Rozpocznij onboarding','Uruchom proces wdrożenia nowego klienta')}
 ${actionTile('docs','▧','Braki dokumentów','Sprawdź brakujące dokumenty od klienta')}
 ${actionTile('offer','◇','Wyślij ofertę','Przygotuj i wyślij ofertę współpracy')}
 ${actionTile('note','✎','Dodaj notatkę','Zapisz ważne informacje o kliencie')}
</div>
<div class="section-row kpi-title"><h3>Najważniejsze wskaźniki</h3><span>Ten miesiąc</span></div>
<div class="kpis premium">
  <div class="kpi-card pink"><div class="kpi-icon">♧</div><div><span>Nowe leady</span><b>${stats.totals.total}</b><small>łącznie w bazie</small></div></div>
  <div class="kpi-card peach"><div class="kpi-icon">▣</div><div><span>Follow-upy dziś</span><b>${followups}</b><small>zaplanowane na dziś</small></div></div>
  <div class="kpi-card blue"><div class="kpi-icon">◇</div><div><span>Oferty oczekujące</span><b>${offers}</b><small>w pipeline</small></div></div>
  <div class="kpi-card green"><div class="kpi-icon">↗</div><div><span>Nowy MRR</span><b>${money(stats.totals.won_mrr)}</b><small>wygrane szanse</small></div></div>
</div>
<div class="bottom-grid">
 <div class="activity-card"><div class="side-title"><h3>Historia dzisiejszych aktywności</h3><button data-view-link="history">Zobacz wszystkie →</button></div>${hist.slice(0,5).map(activityRow).join('')||'<div class="mini-empty">Brak aktywności — pojawią się tutaj po pracy z CRM.</div>'}</div>
 <div class="side-card recent"><div class="side-title"><h3>Ostatnio używani</h3><button data-view-link="leads">Zobacz wszystkich →</button></div>${recent.map(clientRow).join('')||'<div class="mini-empty">Brak rekordów</div>'}</div>
</div>`;
bindDashboardActions();
if(active){setInterval(()=>{const el=document.querySelector('#liveTimer');if(el)el.textContent=elapsed(active.updated_at||active.created_at)},1000)}
}
function clientRow(l,fav=false){return `<div class="client-row"><span class="avatar-mini">${initials(l.company)}</span><div><b>${l.company}</b><small>${l.contact||l.stage}</small></div><span class="star">${fav?'★':'☆'}</span></div>`}
function activityRow(r){return `<div class="activity-row"><span class="activity-dot"></span><span class="activity-time">${new Date(r.created_at).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</span><span class="activity-icon">●</span><div><b>${r.title}</b><small>${r.detail||''}</small></div><i>•••</i></div>`}
function actionTile(action,icon,label,desc,active=false){return `<button class="action-tile ${active?'highlight':''}" data-action="${action}"><span>${icon}</span><div><b>${label}</b><small>${desc}</small></div></button>`}
function bindDashboardActions(){document.querySelectorAll('[data-view-link]').forEach(b=>b.onclick=()=>{view=b.dataset.viewLink;render()});document.querySelectorAll('[data-action]').forEach(b=>b.onclick=async()=>{const a=b.dataset.action;if(a==='new-lead')return document.querySelector('#modal').classList.remove('hidden');const map={task:'reminders',meeting:'reminders',message:'emails',onboarding:'clients',docs:'notes',offer:'offers',note:'notes',contact:'leads'};view=map[a]||'dashboard';render()})}
async function statsView(){const base=await api('/api/stats');const owners=base.owners.map(x=>x.owner);app.innerHTML=`<div class="stats-toolbar"><label>Statystyki dla<select id="statsOwner"><option value="all">Cały zespół</option>${owners.map(o=>`<option value="${o}">${o}</option>`).join('')}</select></label></div><div id="statsBody"></div>`;const draw=async()=>{const owner=document.querySelector('#statsOwner').value,data=owner==='all'?base:await api('/api/stats?owner='+encodeURIComponent(owner)),t=data.totals;document.querySelector('#statsBody').innerHTML=`<div class="kpis premium"><div class="kpi-card pink"><div><span>Leady</span><b>${t.total}</b><small>łącznie</small></div></div><div class="kpi-card peach"><div><span>Wygrane</span><b>${t.won}</b><small>${money(t.won_mrr)} MRR</small></div></div><div class="kpi-card blue"><div><span>Konwersja</span><b>${t.conversion}%</b><small>lead → klient</small></div></div><div class="kpi-card green"><div><span>Pipeline</span><b>${money(t.pipeline_mrr)}</b><small>aktywny MRR</small></div></div></div><div class="report-grid"><div class="card"><h3>Etapy</h3>${data.stages.map(x=>`<div class="metric"><span>${x.stage}</span><b>${x.count} • ${money(x.mrr)}</b></div>`).join('')}</div><div class="card"><h3>Źródła</h3>${data.sources.map(x=>`<div class="metric"><span>${x.source}</span><b>${x.won}/${x.count}</b></div>`).join('')}</div></div>`};document.querySelector('#statsOwner').onchange=draw;draw()}
async function pipeline(){await loadLeads();app.innerHTML=`<div class="board-tools"><input id="boardSearch" placeholder="Szukaj szansy..."><select id="boardSource"><option value="">Wszystkie źródła</option>${[...new Set(leads.map(l=>l.source))].map(s=>`<option>${s}</option>`).join('')}</select><select id="boardGrade"><option value="">Każdy segment</option><option>A</option><option>B</option><option>C</option></select></div><div id="pipelineBoard" class="pipeline"></div>`;const draw=()=>{const q=document.querySelector('#boardSearch').value.toLowerCase(),src=document.querySelector('#boardSource').value,gr=document.querySelector('#boardGrade').value,filtered=leads.filter(l=>(!src||l.source===src)&&(!gr||l.grade===gr)&&(`${l.company} ${l.contact} ${l.owner}`.toLowerCase().includes(q)));document.querySelector('#pipelineBoard').innerHTML=stages.map(s=>{const ls=filtered.filter(l=>l.stage===s),total=ls.reduce((a,l)=>a+l.mrr,0);return `<div class="column"><div class="column-head"><div>${s}<span class="column-total">${money(total)} MRR</span></div><span class="count">${ls.length}</span></div><div class="column-body">${ls.map(card).join('')||'<div class="empty">Brak szans</div>'}</div></div>`}).join('');document.querySelectorAll('.lead-card').forEach(el=>el.onclick=()=>advance(Number(el.dataset.id)))};['#boardSearch','#boardSource','#boardGrade'].forEach(sel=>document.querySelector(sel).addEventListener('input',draw));draw()}
function card(l){return `<div class="lead-card" data-id="${l.id}"><span class="more">⋮</span><h4>${l.company}</h4><p>${l.contact} • ${l.owner||'Nieprzypisany'}</p><div class="lead-price">${money(l.mrr)}</div><div class="lead-meta"><span>${l.followup||'brak terminu'} ${overdue(l.followup)?'<span class="overdue-badge">po terminie</span>':''}</span><span class="grade-dot grade-${l.grade.toLowerCase()}">${l.grade}</span></div></div>`}
async function advance(id){const l=leads.find(x=>x.id===id),i=stages.indexOf(l.stage);if(!l||i>=stages.length-1)return;await api('/api/leads',{method:'PATCH',body:JSON.stringify({id,stage:stages[i+1]})});await render()}
async function leadTable(){await loadLeads();app.innerHTML=`<div class="toolbar"><input id="q" placeholder="Szukaj firmy, kontaktu lub opiekuna…"><select id="stageFilter"><option value="">Wszystkie etapy</option>${stages.map(s=>`<option>${s}</option>`).join('')}</select></div><div class="table-wrap"><table><thead><tr><th>Firma</th><th>Kontakt</th><th>Opiekun</th><th>Źródło</th><th>Etap</th><th>Segment</th><th>MRR</th><th>Follow-up</th></tr></thead><tbody id="rows"></tbody></table></div>`;const draw=()=>{let q=document.querySelector('#q').value.toLowerCase(),sf=document.querySelector('#stageFilter').value;document.querySelector('#rows').innerHTML=leads.filter(l=>(!sf||l.stage===sf)&&(`${l.company} ${l.contact} ${l.owner} ${l.email}`.toLowerCase().includes(q))).map(l=>`<tr><td><b>${l.company}</b><br><small>${l.note||''}</small></td><td>${l.contact}<br><small>${l.email||''}</small></td><td>${l.owner||'Nieprzypisany'}</td><td>${l.source}</td><td>${l.stage}</td><td><span class="chip ${l.grade.toLowerCase()}">${l.grade}</span></td><td>${money(l.mrr)}</td><td class="${overdue(l.followup)?'overdue':'ok'}">${l.followup||'—'}</td></tr>`).join('')||'<tr><td colspan="8">Brak leadów. Dodaj pierwszy rekord.</td></tr>'};document.querySelector('#q').oninput=draw;document.querySelector('#stageFilter').onchange=draw;draw()}
async function genericModule(key){const rows=await api('/api/modules?module='+encodeURIComponent(key));app.innerHTML=`<div class="module-actions"><button class="secondary" id="addModule">+ Dodaj</button><input id="moduleSearch" placeholder="Szukaj..."></div><div class="module-grid" id="moduleGrid"></div>`;const draw=()=>{const q=document.querySelector('#moduleSearch').value.toLowerCase();document.querySelector('#moduleGrid').innerHTML=rows.filter(r=>(r.title+' '+r.detail+' '+r.status).toLowerCase().includes(q)).map(r=>`<div class="module-card"><div class="module-icon">#</div><div><b>${r.title}</b><span>${r.detail||r.status||''}</span></div><button class="delete-item" data-id="${r.id}">×</button></div>`).join('')||'<div class="empty card">Brak danych. Dodaj pierwszy wpis.</div>';document.querySelectorAll('.delete-item').forEach(b=>b.onclick=async()=>{await api('/api/modules?module='+encodeURIComponent(key)+'&id='+b.dataset.id,{method:'DELETE'});await render()})};document.querySelector('#moduleSearch').oninput=draw;document.querySelector('#addModule').onclick=async()=>{const a=prompt('Nazwa / tytuł:');if(!a)return;const b=prompt('Opis / status:')||'';await api('/api/modules',{method:'POST',body:JSON.stringify({module:key,title:a,detail:b})});await render()};draw()}

function notificationKey(n){return [n.type,n.id||'',n.title,n.date||''].join(':')}
function readNotifications(){try{return new Set(JSON.parse(localStorage.getItem('brcrm.readNotifications')||'[]'))}catch{return new Set()}}
function saveReadNotifications(set){localStorage.setItem('brcrm.readNotifications',JSON.stringify([...set]))}
async function buildNotifications(){
  await loadLeads();
  const reminders=await api('/api/modules?module=reminders').catch(()=>[]);
  const today=new Date().toISOString().slice(0,10);
  const items=[];
  leads.forEach(l=>{
    if(l.followup && l.followup<today && !['Wygrany','Przegrany'].includes(l.stage)) items.push({type:'overdue',id:l.id,title:'Zaległy follow-up',detail:l.company,date:l.followup,view:'leads',priority:3});
    if(l.followup===today && !['Wygrany','Przegrany'].includes(l.stage)) items.push({type:'today',id:l.id,title:'Follow-up na dziś',detail:l.company,date:l.followup,view:'leads',priority:2});
    if((!l.owner||l.owner==='Nieprzypisany') && !['Wygrany','Przegrany'].includes(l.stage)) items.push({type:'owner',id:l.id,title:'Lead bez opiekuna',detail:l.company,date:l.created_at,view:'leads',priority:2});
    if(l.stage==='Oferta' || l.stage==='Follow-up') {
      const age=(Date.now()-new Date(l.updated_at||l.created_at).getTime())/86400000;
      if(age>=3) items.push({type:'stale-offer',id:l.id,title:'Oferta czeka na reakcję',detail:l.company,date:l.updated_at||l.created_at,view:'pipeline',priority:1});
    }
  });
  reminders.slice(0,10).forEach(r=>items.push({type:'reminder',id:r.id,title:r.title||'Przypomnienie',detail:r.detail||'',date:r.created_at,view:'reminders',priority:1}));
  items.sort((a,b)=>b.priority-a.priority||new Date(a.date||0)-new Date(b.date||0));
  return items.slice(0,20);
}
async function refreshNotifications(){
  try{
    const items=await buildNotifications(),read=readNotifications();
    const unread=items.filter(n=>!read.has(notificationKey(n))).length;
    notificationBadge.textContent=unread>99?'99+':String(unread);
    notificationBadge.classList.toggle('hidden-badge',unread===0);
    notificationSummary.textContent=unread===1?'1 nowe':unread+' nowych';
    notificationList.innerHTML=items.length?items.map(n=>{
      const key=notificationKey(n),isRead=read.has(key);
      const icon=n.type==='overdue'?'!':n.type==='today'?'◴':n.type==='owner'?'♙':n.type==='stale-offer'?'◇':'✓';
      return `<button class="notification-item ${isRead?'is-read':''}" data-notification-key="${encodeURIComponent(key)}" data-notification-view="${n.view}"><span class="notification-icon">${icon}</span><span class="notification-copy"><b>${n.title}</b><small>${n.detail}</small></span><span class="notification-time">${n.date?datePL(n.date):''}</span></button>`
    }).join(''):'<div class="notification-empty">Wszystko ogarnięte 🎉<small>Nie masz teraz żadnych alertów.</small></div>';
    notificationList.querySelectorAll('.notification-item').forEach(el=>el.onclick=()=>{
      const set=readNotifications();set.add(decodeURIComponent(el.dataset.notificationKey));saveReadNotifications(set);
      notificationPanel.classList.add('hidden');view=el.dataset.notificationView||'dashboard';render();refreshNotifications();refreshNotifications();
    });
  }catch(e){
    notificationBadge.textContent='!';
    notificationList.innerHTML='<div class="notification-empty">Nie udało się pobrać powiadomień.</div>';
  }
}
notificationBtn.onclick=async e=>{e.stopPropagation();notificationPanel.classList.toggle('hidden');if(!notificationPanel.classList.contains('hidden'))await refreshNotifications()};
document.querySelector('#markAllRead').onclick=async()=>{const items=await buildNotifications();const set=readNotifications();items.forEach(n=>set.add(notificationKey(n)));saveReadNotifications(set);await refreshNotifications()};
document.addEventListener('click',e=>{if(!e.target.closest('.notification-wrap'))notificationPanel.classList.add('hidden')});

document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{view=b.dataset.view;render()});
const modal=document.querySelector('#modal');addLeadBtn.onclick=()=>modal.classList.remove('hidden');document.querySelector('#closeModal').onclick=()=>modal.classList.add('hidden');
document.querySelector('#leadForm').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));try{await api('/api/leads',{method:'POST',body:JSON.stringify({...d,mrr:Number(d.mrr)||0,stage:'Nowy lead'})});e.target.reset();modal.classList.add('hidden');await api('/api/modules',{method:'POST',body:JSON.stringify({module:'history',title:'Dodano lead',detail:d.company})}).catch(()=>{});await render()}catch(err){alert(err.message)}};
document.querySelector('#globalSearch').oninput=async e=>{const q=e.target.value.trim();if(q.length<2)return;try{await loadLeads();const hit=leads.some(l=>(l.company+' '+l.contact+' '+l.email+' '+l.owner).toLowerCase().includes(q.toLowerCase()));if(hit){view='leads';await render();const inp=document.querySelector('#q');if(inp){inp.value=q;inp.dispatchEvent(new Event('input'))}}}catch{}};
render();