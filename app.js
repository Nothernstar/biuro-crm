const stages=['Nowy lead','Do kontaktu','Kontakt wykonany','Kwalifikacja','Oferta','Follow-up','Wygrany','Przegrany'];
let leads=[],view=localStorage.getItem('brcrm_view')||'dashboard',currentUser=null,pendingOwnerFilter=null,selectedClientId=Number(localStorage.getItem('brcrm_client_id')||0)||null,selectedLeadId=Number(localStorage.getItem('brcrm_lead_id')||0)||null;

const $=s=>document.querySelector(s);
const app=$('#app'),title=$('#viewTitle'),subtitle=$('#subtitle'),crumb=$('#crumb'),addLeadBtn=$('#addLead');
const authScreen=$('#authScreen'),appShell=$('#appShell'),authLoading=$('#authLoading'),loginForm=$('#loginForm'),setupForm=$('#setupForm'),changePasswordForm=$('#changePasswordForm');
const notificationBtn=$('#notificationBtn'),notificationPanel=$('#notificationPanel'),notificationBadge=$('#notificationBadge'),notificationList=$('#notificationList'),notificationSummary=$('#notificationSummary');
const employeeBtn=$('#employeeBtn'),employeePanel=$('#employeePanel'),employeeStats=$('#employeeStats'),employeeLeadList=$('#employeeLeadList');

const labels={
 dashboard:['Pulpit','Najważniejsze informacje z Twojego biura rachunkowego.'],
 stats:['Statystyki','Wyniki całego zespołu lub wybranego opiekuna.'],
 users:['Użytkownicy','Zespół, role i dostęp do CRM.'],
 history:['Historia zmian','Rejestr zmian w systemie.'],
 reminders:['Przypomnienia','Zadania i terminy wymagające działania.'],
 meetings:['Spotkania','Kalendarz spotkań z klientami i leadami.'],
 emails:['Wiadomości e-mail','Robocza skrzynka i status korespondencji.'],
 clients:['Klienci','Aktywni klienci biura rachunkowego.'],
 clientDetail:['Karta klienta','Dane księgowe i organizacyjne klienta.'],
 leads:['Leady / Potencjalni klienci','Pełna lista kontaktów sprzedażowych.'],
 leadDetail:['Proces leada','Onboarding, odpowiedzialności i historia procesu.'],
 pipeline:['Szanse sprzedaży','Zarządzaj leadami i przesuwaj je przez kolejne etapy sprzedaży.'],
 offers:['Oferty','Wysłane i przygotowywane oferty.'],
 notes:['Notatki','Notatki handlowe i operacyjne.'],
 automations:['Automatyzacje','Reguły automatyzujące proces sprzedaży.'],
 templates:['Szablony dokumentów','Gotowe dokumenty i wzory.'],
 sequences:['Sekwencje e-mail','Zaplanowane serie wiadomości.'],
 integrations:['Integracje','Połączenia z zewnętrznymi usługami.'],
 settings:['Ustawienia systemu','Konfiguracja CRM.']
};

const money=n=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN',maximumFractionDigits:0}).format(n||0);
const initials=s=>(s||'').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'--';
const datePL=d=>d?new Date(d).toLocaleDateString('pl-PL'):'—';
const overdue=d=>d&&new Date(d)<new Date(new Date().toISOString().slice(0,10));
const roleLabel=r=>r==='admin'?'Administrator':r==='manager'?'Manager':'Pracownik';
const currentEmployeeName=()=>currentUser?.full_name||'';

async function api(url,opts={}){
 const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});
 if(!r.ok){let m='Błąd API';try{m=(await r.json()).error||m}catch{}throw new Error(m)}
 if(r.status===204)return null;
 return r.json();
}
async function loadLeads(){leads=await api('/api/leads')}
function loading(msg='Ładowanie danych…'){app.innerHTML=`<div class="loading-card">${msg}</div>`}
function errorCard(e){app.innerHTML=`<div class="error-card"><b>Wystąpił błąd.</b><span>${e.message}</span></div>`}
function elapsed(iso){if(!iso)return'00:00:00';let sec=Math.max(0,Math.floor((Date.now()-new Date(iso).getTime())/1000));return [Math.floor(sec/3600),Math.floor(sec%3600/60),sec%60].map(x=>String(x).padStart(2,'0')).join(':')}

function applyCurrentUser(){
 const name=currentUser?.full_name||'Użytkownik',role=roleLabel(currentUser?.role);
 $('#userName').textContent=name; $('#userRole').textContent=role; $('#userInitials').textContent=initials(name);
 $('#employeeName').textContent=name; $('#employeeRole').textContent=role; $('#employeeAvatar').textContent=initials(name);
 document.querySelectorAll('[data-admin-only]').forEach(el=>el.style.display=currentUser?.role==='admin'?'flex':'none');
}

function showAuthForm(kind){
 authLoading.classList.add('hidden');
 loginForm.classList.toggle('hidden',kind!=='login');
 setupForm.classList.toggle('hidden',kind!=='setup');
 changePasswordForm.classList.toggle('hidden',kind!=='change-password');
}
async function enterApp(){
 applyCurrentUser();
 authScreen.classList.add('hidden');
 appShell.classList.remove('auth-hidden');
 if(!labels[view]) view='dashboard';
 await render();
 await refreshNotifications();
}
async function bootAuth(){
 authScreen.classList.remove('hidden');appShell.classList.add('auth-hidden');
 authLoading.classList.remove('hidden');authLoading.textContent='Sprawdzanie systemu…';
 loginForm.classList.add('hidden');setupForm.classList.add('hidden');changePasswordForm.classList.add('hidden');
 try{
   const state=await api('/api/auth');
   if(state.user){
     currentUser=state.user;
     if(currentUser.must_change_password){showAuthForm('change-password');return}
     await enterApp();return;
   }
   showAuthForm(state.setup_required?'setup':'login');
 }catch(e){authLoading.textContent='Nie udało się uruchomić logowania: '+e.message}
}

loginForm.onsubmit=async e=>{
 e.preventDefault();const d=Object.fromEntries(new FormData(loginForm)),err=$('#loginError');err.classList.add('hidden');
 try{
   const r=await api('/api/auth',{method:'POST',body:JSON.stringify({action:'login',email:d.email,password:d.password})});
   currentUser=r.user;loginForm.reset();
   if(currentUser.must_change_password){showAuthForm('change-password');return}
   await enterApp();
 }catch(x){err.textContent=x.message;err.classList.remove('hidden')}
};
setupForm.onsubmit=async e=>{
 e.preventDefault();const d=Object.fromEntries(new FormData(setupForm)),err=$('#setupError');err.classList.add('hidden');
 if(d.password!==d.password_confirm){err.textContent='Hasła nie są takie same.';err.classList.remove('hidden');return}
 try{
   const r=await api('/api/auth',{method:'POST',body:JSON.stringify({action:'setup',full_name:d.full_name,email:d.email,password:d.password})});
   currentUser=r.user;setupForm.reset();await enterApp();
 }catch(x){err.textContent=x.message;err.classList.remove('hidden')}
};
changePasswordForm.onsubmit=async e=>{
 e.preventDefault();
 const d=Object.fromEntries(new FormData(changePasswordForm)),err=$('#changePasswordError');
 err.classList.add('hidden');
 if(d.password!==d.password_confirm){err.textContent='Hasła nie są takie same.';err.classList.remove('hidden');return}
 try{
   const r=await api('/api/auth',{method:'POST',body:JSON.stringify({action:'change_password',password:d.password})});
   currentUser=r.user;changePasswordForm.reset();await enterApp();
 }catch(x){err.textContent=x.message;err.classList.remove('hidden')}
};

$('#logoutBtn').onclick=async()=>{await api('/api/auth',{method:'POST',body:JSON.stringify({action:'logout'})}).catch(()=>{});currentUser=null;employeePanel.classList.add('hidden');notificationPanel.classList.add('hidden');await bootAuth()};

async function render(){
 if(!currentUser)return;
 localStorage.setItem('brcrm_view',view);
 document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view||(view==='clientDetail'&&b.dataset.view==='clients')||(view==='leadDetail'&&b.dataset.view==='leads')));
 const [t,s]=labels[view]||[view,''];title.textContent=t;subtitle.textContent=s;
 crumb.textContent=(['dashboard','stats','users','history','reminders','emails'].includes(view)?'OGÓLNE / ':'CRM / ')+t;
 addLeadBtn.style.display=['dashboard','pipeline','leads'].includes(view)?'inline-block':'none';
 loading();
 try{
   if(view==='dashboard')return await dashboard();
   if(view==='stats')return await statsView();
   if(view==='users')return await usersView();
   if(view==='reminders')return await remindersView();
   if(view==='clients')return await clientsView();
   if(view==='meetings')return await meetingsView();
   if(view==='clientDetail')return await clientDetailView();
   if(view==='pipeline')return await pipeline();
   if(view==='leads')return await leadTable();
   if(view==='leadDetail')return await leadDetailView();
   return await genericModule(view);
 }catch(e){
   if(e.message==='Wymagane logowanie.'){currentUser=null;return bootAuth()}
   errorCard(e);
 }
}

async function dashboard(){
 await loadLeads();
 const stats=await api('/api/stats');
 const hist=await api('/api/modules?module=history').catch(()=>[]);
 const mine=currentUser.role==='employee'?leads.filter(l=>l.owner===currentEmployeeName()):leads;
 const active=mine.find(l=>!['Wygrany','Przegrany'].includes(l.stage))||mine[0]||null;
 const recent=mine.slice(0,5),won=mine.filter(l=>l.stage==='Wygrany').slice(0,5);
 const today=new Date().toISOString().slice(0,10);
 const followups=mine.filter(l=>l.followup===today).length;
 const offers=mine.filter(l=>['Oferta','Follow-up'].includes(l.stage)).length;
 app.innerHTML=`
 <div class="dash-head"><div><h2>Dzień dobry, ${currentUser.full_name.split(' ')[0]}!</h2><p>Oto najważniejsze informacje z Twojego biura rachunkowego.</p></div><div class="date-pill">▣ ${new Date().toLocaleDateString('pl-PL',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div></div>
 <div class="hero-grid">
  <div class="active-lead">
   ${active?`<div class="active-left"><div class="eyebrow">● AKTYWNY LEAD</div><div class="timer" id="liveTimer">${elapsed(active.updated_at||active.created_at)}</div><div class="timer-label">◴ Czas od ostatniej aktywności</div><div class="hero-chips"><span>▣ Ostatni kontakt: ${datePL(active.updated_at||active.created_at)}</span><span>♙ Opiekun: ${active.owner||'Nieprzypisany'}</span></div></div><div class="active-right"><div><h3>${active.company}</h3><p>${active.email||active.phone||'Brak danych kontaktowych'}</p></div><div class="stage-block"><span>Etap w sprzedaży</span><b>${active.stage}</b></div><button class="contact-btn" data-action="contact">☎ Skontaktuj się</button></div>`:`<div class="empty-lead"><b>Brak aktywnych leadów</b><span>Dodaj pierwszy rekord lub przypisz lead do tego pracownika.</span><button class="contact-btn" data-action="new-lead">+ Dodaj lead</button></div>`}
  </div>
  <div class="side-card"><div class="side-title"><h3>Ulubieni klienci</h3><button data-view-link="clients">Zobacz wszystkich →</button></div>${(won.length?won:recent).map((l,i)=>clientRow(l,i===0)).join('')||'<div class="mini-empty">Brak klientów</div>'}</div>
 </div>
 <div class="section-row"><h3>Wybierz czynność</h3><span>Szybkie akcje do codziennej pracy w CRM.</span></div>
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
  <div class="kpi-card pink"><div class="kpi-icon">♧</div><div><span>Leady</span><b>${stats.totals.total}</b><small>w bazie</small></div></div>
  <div class="kpi-card peach"><div class="kpi-icon">▣</div><div><span>Follow-upy dziś</span><b>${followups}</b><small>na dziś</small></div></div>
  <div class="kpi-card blue"><div class="kpi-icon">◇</div><div><span>Oferty oczekujące</span><b>${offers}</b><small>w pipeline</small></div></div>
  <div class="kpi-card green"><div class="kpi-icon">↗</div><div><span>Wygrany MRR</span><b>${money(stats.totals.won_mrr)}</b><small>wygrane szanse</small></div></div>
 </div>
 <div class="bottom-grid">
  <div class="activity-card"><div class="side-title"><h3>Historia aktywności</h3><button data-view-link="history">Zobacz wszystkie →</button></div>${hist.slice(0,5).map(activityRow).join('')||'<div class="mini-empty">Brak aktywności.</div>'}</div>
  <div class="side-card recent"><div class="side-title"><h3>Ostatnio używani</h3><button data-view-link="leads">Zobacz wszystkich →</button></div>${recent.map(clientRow).join('')||'<div class="mini-empty">Brak rekordów</div>'}</div>
 </div>`;
 bindDashboardActions();
 if(active)setInterval(()=>{const el=$('#liveTimer');if(el)el.textContent=elapsed(active.updated_at||active.created_at)},1000);
}
function clientRow(l,fav=false){return `<div class="client-row"><span class="avatar-mini">${initials(l.company)}</span><div><b>${l.company}</b><small>${l.contact||l.stage}</small></div><span class="star">${fav?'★':'☆'}</span></div>`}
function activityRow(r){return `<div class="activity-row"><span class="activity-dot"></span><span class="activity-time">${new Date(r.created_at).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</span><span class="activity-icon">●</span><div><b>${r.title}</b><small>${r.detail||''}</small></div><i>•••</i></div>`}
function actionTile(action,icon,label,desc,active=false){return `<button class="action-tile ${active?'highlight':''}" data-action="${action}"><span>${icon}</span><div><b>${label}</b><small>${desc}</small></div></button>`}
function bindDashboardActions(){document.querySelectorAll('[data-view-link]').forEach(b=>b.onclick=()=>{view=b.dataset.viewLink;localStorage.setItem('brcrm_view',view);render()});document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{const a=b.dataset.action;if(a==='new-lead')return $('#modal').classList.remove('hidden');const map={task:'reminders',meeting:'meetings',message:'emails',onboarding:'clients',docs:'notes',offer:'offers',note:'notes',contact:'leads'};view=map[a]||'dashboard';render()})}

async function statsView(){
 const base=await api('/api/stats'),owners=base.owners.map(x=>x.owner);
 app.innerHTML=`<div class="stats-toolbar"><label>Statystyki dla<select id="statsOwner"><option value="all">Cały zespół</option>${owners.map(o=>`<option value="${o}">${o}</option>`).join('')}</select></label></div><div id="statsBody"></div>`;
 const draw=async()=>{const owner=$('#statsOwner').value,data=owner==='all'?base:await api('/api/stats?owner='+encodeURIComponent(owner)),t=data.totals;$('#statsBody').innerHTML=`<div class="kpis premium"><div class="kpi-card pink"><div><span>Leady</span><b>${t.total}</b><small>łącznie</small></div></div><div class="kpi-card peach"><div><span>Wygrane</span><b>${t.won}</b><small>${money(t.won_mrr)} MRR</small></div></div><div class="kpi-card blue"><div><span>Konwersja</span><b>${t.conversion}%</b><small>lead → klient</small></div></div><div class="kpi-card green"><div><span>Pipeline</span><b>${money(t.pipeline_mrr)}</b><small>aktywny MRR</small></div></div></div><div class="report-grid"><div class="card"><h3>Etapy</h3>${data.stages.map(x=>`<div class="metric"><span>${x.stage}</span><b>${x.count} • ${money(x.mrr)}</b></div>`).join('')}</div><div class="card"><h3>Źródła</h3>${data.sources.map(x=>`<div class="metric"><span>${x.source}</span><b>${x.won}/${x.count}</b></div>`).join('')}</div></div>`};
 const select=$('#statsOwner');select.onchange=draw;
 if(currentUser.role==='employee'){select.innerHTML=`<option value="${currentEmployeeName()}">${currentEmployeeName()}</option>`;select.disabled=true}
 else if(pendingOwnerFilter&&owners.includes(pendingOwnerFilter)){select.value=pendingOwnerFilter;pendingOwnerFilter=null}
 draw();
}

async function usersView(){
 if(currentUser?.role!=='admin'){app.innerHTML='<div class="error-card"><b>Brak dostępu.</b><span>Tylko administrator może zarządzać użytkownikami.</span></div>';return}
 const users=await api('/api/users');
 app.innerHTML=`<div class="card users-card"><div class="users-head"><div><h3>Użytkownicy systemu</h3><p>Twórz konta, ustawiaj role i kontroluj dostęp.</p></div><button class="primary" id="openUserForm">+ Dodaj użytkownika</button></div><div class="user-table">${users.map(u=>`<div class="user-row"><span class="user-avatar">${initials(u.full_name)}</span><div class="user-main"><b>${u.full_name}</b><small>${u.email}</small></div><span class="role-pill role-${u.role}">${roleLabel(u.role)}</span><span class="status-pill ${u.is_active?'active':'inactive'}">${u.is_active?'Aktywny':'Wyłączony'}</span><small class="last-login">${u.must_change_password?'Hasło tymczasowe — oczekuje na zmianę':(u.last_login_at?'Ostatnie logowanie: '+new Date(u.last_login_at).toLocaleString('pl-PL'):'Jeszcze się nie logował')}</small><button class="user-edit" data-user-id="${u.id}">Edytuj</button></div>`).join('')}</div></div>
 <div class="user-form-panel hidden" id="userFormPanel"><div class="user-form-card"><div class="modal-head"><h2 id="userFormTitle">Nowy użytkownik</h2><button id="closeUserForm">×</button></div><form id="userForm"><input type="hidden" name="id"><label>Imię i nazwisko<input name="full_name" required></label><label>E-mail<input name="email" type="email" required></label><label>Rola<select name="role"><option value="employee">Pracownik</option><option value="manager">Manager</option><option value="admin">Administrator</option></select></label><label id="passwordLabel">Hasło tymczasowe<div class="password-admin-field"><input name="password" id="adminPasswordInput" type="password" minlength="8" placeholder="min. 8 znaków"><button type="button" id="toggleAdminPassword">Pokaż</button><button type="button" id="generateAdminPassword">Wygeneruj</button></div><small class="password-help" id="passwordHelp">Użytkownik zmieni to hasło przy pierwszym logowaniu.</small></label><label class="toggle-label"><input name="is_active" type="checkbox" checked> Konto aktywne</label><button class="primary wide">Zapisz użytkownika</button><div id="userFormError" class="auth-error hidden"></div></form></div></div>
 <div class="user-form-panel hidden" id="tempPasswordPanel"><div class="temp-password-card"><span class="auth-badge">Hasło tymczasowe</span><h2>Zapisz lub przekaż użytkownikowi</h2><p>To jedyny moment, kiedy system pokazuje to hasło. Po zamknięciu nie będzie można go odczytać — można tylko ustawić nowe.</p><div class="temp-password-value"><code id="tempPasswordValue"></code><button id="copyTempPassword">Kopiuj</button></div><button class="primary wide" id="closeTempPassword">Gotowe</button></div></div>`;
 const panel=$('#userFormPanel'),form=$('#userForm'),passwordInput=$('#adminPasswordInput');
 const generatePassword=()=>{const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';let out='';const arr=new Uint32Array(14);crypto.getRandomValues(arr);arr.forEach(n=>out+=chars[n%chars.length]);return out};
 $('#toggleAdminPassword').onclick=()=>{passwordInput.type=passwordInput.type==='password'?'text':'password';$('#toggleAdminPassword').textContent=passwordInput.type==='password'?'Pokaż':'Ukryj'};
 $('#generateAdminPassword').onclick=()=>{passwordInput.value=generatePassword();passwordInput.type='text';$('#toggleAdminPassword').textContent='Ukryj'};
 $('#openUserForm').onclick=()=>{form.reset();form.is_active.checked=true;form.email.disabled=false;passwordInput.required=true;$('#passwordHelp').textContent='Użytkownik zmieni to hasło przy pierwszym logowaniu.';$('#userFormTitle').textContent='Nowy użytkownik';panel.classList.remove('hidden')};
 $('#closeUserForm').onclick=()=>panel.classList.add('hidden');
 document.querySelectorAll('.user-edit').forEach(btn=>btn.onclick=()=>{const u=users.find(x=>String(x.id)===btn.dataset.userId);form.id.value=u.id;form.full_name.value=u.full_name;form.email.value=u.email;form.email.disabled=false;form.role.value=u.role;form.password.value='';form.is_active.checked=u.is_active;passwordInput.required=false;$('#passwordHelp').textContent='Starego hasła nie da się odczytać. Wpisz nowe, jeśli chcesz je zresetować.';$('#userFormTitle').textContent='Edytuj użytkownika';panel.classList.remove('hidden')});
 const revealPassword=async password=>{panel.classList.add('hidden');$('#tempPasswordValue').textContent=password;$('#copyTempPassword').textContent='Kopiuj';$('#tempPasswordPanel').classList.remove('hidden')};
 $('#copyTempPassword').onclick=async()=>{try{await navigator.clipboard.writeText($('#tempPasswordValue').textContent);$('#copyTempPassword').textContent='Skopiowano ✓'}catch{$('#copyTempPassword').textContent='Zaznacz i skopiuj'}};
 $('#closeTempPassword').onclick=async()=>{$('#tempPasswordValue').textContent='';$('#tempPasswordPanel').classList.add('hidden');await render()};
 form.onsubmit=async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(form)),err=$('#userFormError');err.classList.add('hidden');try{const tempPassword=fd.password||'';if(fd.id){const updated=await api('/api/users',{method:'PATCH',body:JSON.stringify({id:Number(fd.id),full_name:fd.full_name,email:fd.email,role:fd.role,is_active:form.is_active.checked,password:tempPassword||undefined})});if(Number(currentUser.id)===Number(updated.id)){currentUser={...currentUser,...updated};applyCurrentUser()}if(tempPassword){await revealPassword(tempPassword);return}}else{await api('/api/users',{method:'POST',body:JSON.stringify({full_name:fd.full_name,email:fd.email,role:fd.role,password:tempPassword})});await revealPassword(tempPassword);return}panel.classList.add('hidden');await render()}catch(x){err.textContent=x.message;err.classList.remove('hidden')}};
}

async function clientsView(){
 const clients=await api('/api/clients');
 app.innerHTML=`
 <div class="clients-toolbar">
   <div class="clients-toolbar-left">
     <div class="clients-search"><span>⌕</span><input id="clientSearch" placeholder="Szukaj po nazwie, osobie, NIP, REGON lub KRS..."></div>
     <select id="clientTypeFilter" class="client-type-filter">
       <option value="">Wszystkie formy prawne</option>
       <option value="jdg">JDG</option>
       <option value="company">Spółka</option>
       <option value="foundation">Fundacja</option>
     </select>
     <select id="clientStatusFilter" class="client-type-filter">
       <option value="">Wszystkie statusy</option>
       <option value="active">Aktywny</option>
       <option value="suspended">Zawieszony</option>
       <option value="inactive">Nieobsługiwany</option>
       <option value="payment_hold">Wstrzymany – zaległości płatnicze</option>
     </select>
     <select id="clientSort" class="client-type-filter">
       <option value="asc">Nazwa A–Z</option>
       <option value="desc">Nazwa Z–A</option>
     </select>
   </div>
   <button class="primary" id="openClientForm">+ Dodaj klienta</button>
 </div>
 <div class="clients-list-wrap">
   <div class="clients-list-head">
     <span>Klient</span><span>Status</span><span>Forma prawna</span><span>Imię</span><span>Nazwisko</span><span>NIP</span><span>REGON</span><span>PESEL / KRS</span><span>Akcje</span>
   </div>
   <div class="clients-list" id="clientsGrid"></div>
 </div>
 <div class="client-form-panel hidden" id="clientFormPanel">
   <div class="client-form-card">
     <div class="modal-head"><div><h2 id="clientFormTitle">Nowy klient</h2><p>Uzupełnij dane klienta lub pobierz je z rejestru publicznego.</p></div><button id="closeClientForm">×</button></div>
     <form id="clientForm">
       <input type="hidden" name="id">
       <label>Nazwa firmy / działalności<input name="name" required placeholder="np. ABC Consulting"></label>
       <label>Status klienta
         <select name="client_status">
           <option value="active">Aktywny</option>
           <option value="suspended">Zawieszony</option>
           <option value="inactive">Nieobsługiwany</option>
           <option value="payment_hold">Wstrzymany – zaległości płatnicze</option>
         </select>
       </label>
       <label>Typ podmiotu
         <div class="entity-switch" id="entitySwitch">
           <button type="button" data-entity="jdg" class="active">JDG</button>
           <button type="button" data-entity="company">Spółka</button>
           <button type="button" data-entity="foundation">Fundacja</button>
         </div>
         <input type="hidden" name="entity_type" value="jdg">
       </label>
       <div class="grid2">
         <label>NIP<div class="lookup-field"><input name="nip" inputmode="numeric" maxlength="10" placeholder="10 cyfr" required><button type="button" class="gus-btn" data-gus="nip">Pobierz dane</button></div></label>
         <label>REGON<input name="regon" inputmode="numeric" maxlength="14" placeholder="REGON"></label>
         <label id="firstNameField">Imię<input name="first_name" placeholder="np. Jan"></label>
         <label id="lastNameField">Nazwisko<input name="last_name" placeholder="np. Kowalski"></label>
         <label id="peselField">PESEL<input name="pesel" inputmode="numeric" maxlength="11" placeholder="11 cyfr"></label>
         <label id="krsField" class="hidden">KRS<input name="krs" inputmode="numeric" maxlength="10" placeholder="Numer KRS"></label>
       </div>
       <div class="gus-status hidden" id="gusStatus"></div>
       <button class="primary wide">Zapisz klienta</button>
       <div class="auth-error hidden" id="clientFormError"></div>
     </form>
   </div>
 </div>`;
 const grid=$('#clientsGrid'),panel=$('#clientFormPanel'),form=$('#clientForm'),q=$('#clientSearch'),typeFilter=$('#clientTypeFilter'),statusFilter=$('#clientStatusFilter'),sortSelect=$('#clientSort');
 const typeLabel=t=>t==='jdg'?'JDG':t==='company'?'Spółka':'Fundacja';
 const statusLabel=s=>s==='suspended'?'Zawieszony':s==='inactive'?'Nieobsługiwany':s==='payment_hold'?'Wstrzymany – płatności':'Aktywny';
 const draw=()=>{
   const term=q.value.toLowerCase().trim(),entity=typeFilter.value,status=statusFilter.value,sort=sortSelect.value;
   const filtered=clients
     .filter(x=>(!entity||x.entity_type===entity)&&(!status||x.client_status===status)&&(x.name+' '+(x.first_name||'')+' '+(x.last_name||'')+' '+(x.contact_name||'')+' '+x.nip+' '+(x.regon||'')+' '+(x.krs||'')+' '+(x.pesel||'')).toLowerCase().includes(term))
     .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pl',{sensitivity:'base'})*(sort==='desc'?-1:1));
   grid.innerHTML=filtered.length?filtered.map(x=>`
     <div class="client-list-row">
       <div class="client-list-name"><span class="client-avatar">${initials(x.name)}</span><button class="client-name-link open-client" data-id="${x.id}" type="button">${x.name}</button></div>
       <div><span class="client-status-pill status-${x.client_status||'active'}">${statusLabel(x.client_status)}</span></div>
       <div><span class="entity-pill">${typeLabel(x.entity_type)}</span></div>
       <div>${x.entity_type==='jdg'?(x.first_name||'—'):'—'}</div>
       <div>${x.entity_type==='jdg'?(x.last_name||'—'):'—'}</div>
       <div class="client-code">${x.nip||'—'}</div>
       <div class="client-code">${x.regon||'—'}</div>
       <div class="client-code">${x.entity_type==='jdg'?(x.pesel||'—'):(x.krs||'—')}</div>
       <div class="client-row-actions"><button class="primary-mini open-client" data-id="${x.id}">Otwórz</button><button class="secondary edit-client" data-id="${x.id}">Edytuj</button>${currentUser.role!=='employee'? `<button class="danger-ghost delete-client" data-id="${x.id}">Usuń</button>`:''}</div>
     </div>`).join(''):'<div class="empty clients-empty">Brak klientów pasujących do filtrów.</div>';
   document.querySelectorAll('.open-client').forEach(b=>b.onclick=()=>{selectedClientId=Number(b.dataset.id);localStorage.setItem('brcrm_client_id',String(selectedClientId));view='clientDetail';localStorage.setItem('brcrm_view',view);render()});
   document.querySelectorAll('.edit-client').forEach(b=>b.onclick=()=>openEdit(Number(b.dataset.id)));
   document.querySelectorAll('.delete-client').forEach(b=>b.onclick=async()=>{if(!confirm('Usunąć tego klienta?'))return;await api('/api/clients?id='+b.dataset.id,{method:'DELETE'});await clientsView()});
 };
 const setEntity=type=>{
   form.entity_type.value=type;
   document.querySelectorAll('[data-entity]').forEach(b=>b.classList.toggle('active',b.dataset.entity===type));
   const isJdg=type==='jdg';
   $('#firstNameField').classList.toggle('hidden',!isJdg);
   $('#lastNameField').classList.toggle('hidden',!isJdg);
   $('#peselField').classList.toggle('hidden',!isJdg);
   $('#krsField').classList.toggle('hidden',isJdg);
   form.first_name.required=isJdg;
   form.last_name.required=isJdg;
   form.pesel.required=isJdg;
   form.krs.required=!isJdg;
   if(!isJdg){form.first_name.value='';form.last_name.value='';form.pesel.value=''}
   if(isJdg)form.krs.value='';
 };
 const openNew=()=>{form.reset();form.id.value='';form.client_status.value='active';setEntity('jdg');$('#gusStatus').classList.add('hidden');$('#clientFormTitle').textContent='Nowy klient';panel.classList.remove('hidden')};
 const openEdit=id=>{const x=clients.find(v=>Number(v.id)===id);if(!x)return;form.id.value=x.id;form.name.value=x.name;form.nip.value=x.nip||'';form.regon.value=x.regon||'';form.first_name.value=x.first_name||'';form.last_name.value=x.last_name||'';form.pesel.value=x.pesel||'';form.krs.value=x.krs||'';form.client_status.value=x.client_status||'active';setEntity(x.entity_type);$('#gusStatus').classList.add('hidden');$('#clientFormTitle').textContent='Edytuj klienta';panel.classList.remove('hidden')};
 $('#openClientForm').onclick=openNew;$('#closeClientForm').onclick=()=>panel.classList.add('hidden');q.oninput=draw;typeFilter.onchange=draw;statusFilter.onchange=draw;sortSelect.onchange=draw;
 document.querySelectorAll('[data-entity]').forEach(b=>b.onclick=()=>setEntity(b.dataset.entity));
 document.querySelectorAll('[data-gus]').forEach(b=>b.onclick=async()=>{
   const kind=b.dataset.gus,val=String(form[kind].value||'').replace(/\D/g,''),status=$('#gusStatus');
   if(!val){status.textContent='Najpierw wpisz '+kind.toUpperCase()+'.';status.className='gus-status error';return}
   b.disabled=true;b.textContent='Pobieram…';status.classList.add('hidden');
   try{
     const data=await api('/api/gus',{method:'POST',body:JSON.stringify({[kind]:val})});
     if(data.name)form.name.value=data.name;
     if(data.nip)form.nip.value=data.nip;
     if(data.regon)form.regon.value=data.regon;
     if(data.krs)form.krs.value=data.krs;
     if(form.entity_type.value==='jdg'){
       if(data.first_name)form.first_name.value=data.first_name;
       if(data.last_name)form.last_name.value=data.last_name;
       if(data.pesel)form.pesel.value=data.pesel;
     }
     status.textContent='Dane pobrane z rejestru publicznego'+(data.source?' • '+data.source:'');
     status.className='gus-status success';
   }catch(e){status.textContent=e.message;status.className='gus-status error'}
   finally{b.disabled=false;b.textContent='Pobierz dane'}
 });
 form.onsubmit=async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(form)),err=$('#clientFormError');err.classList.add('hidden');try{const payload={id:fd.id?Number(fd.id):undefined,name:fd.name,first_name:fd.entity_type==='jdg'?fd.first_name:'',last_name:fd.entity_type==='jdg'?fd.last_name:'',entity_type:fd.entity_type,client_status:fd.client_status,nip:fd.nip,regon:fd.regon,pesel:fd.entity_type==='jdg'?fd.pesel:'',krs:fd.entity_type==='jdg'?'':fd.krs};if(fd.id)await api('/api/clients',{method:'PATCH',body:JSON.stringify(payload)});else await api('/api/clients',{method:'POST',body:JSON.stringify(payload)});panel.classList.add('hidden');await clientsView()}catch(x){err.textContent=x.message;err.classList.remove('hidden')}};
 setEntity('jdg');draw();
}

async function clientDetailView(){
 if(!selectedClientId){
   view='clients';localStorage.setItem('brcrm_view',view);return clientsView();
 }
 const [clients,initialNotes]=await Promise.all([
   api('/api/clients'),
   api('/api/client-notes?client_id='+encodeURIComponent(selectedClientId)).catch(()=>[])
 ]);
 const x=clients.find(v=>Number(v.id)===Number(selectedClientId));
 if(!x){
   selectedClientId=null;localStorage.removeItem('brcrm_client_id');view='clients';localStorage.setItem('brcrm_view',view);return clientsView();
 }
 const isJdg=x.entity_type==='jdg';
 const typeLabel=t=>t==='jdg'?'JDG':t==='company'?'Spółka':'Fundacja';
 const statusLabel=s=>s==='suspended'?'Zawieszony':s==='inactive'?'Nieobsługiwany':s==='payment_hold'?'Wstrzymany – zaległości płatnicze':'Aktywny';
 const safe=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
 let notes=initialNotes;
 let activeTab=localStorage.getItem('brcrm_client_tab')||'tax';
 if(!['tax','notes'].includes(activeTab))activeTab='tax';

 title.textContent=x.name;
 subtitle.textContent='Karta klienta • '+typeLabel(x.entity_type);
 crumb.textContent='CRM / Klienci / '+x.name;

 app.innerHTML=`
 <div class="client-profile-head">
   <button class="back-client-btn" id="backToClients">← Wróć do klientów</button>
   <div class="client-profile-title">
     <span class="client-profile-avatar">${initials(x.name)}</span>
     <div><h2>${safe(x.name)}</h2><div class="client-profile-meta"><span class="client-status-pill status-${x.client_status||'active'}">${statusLabel(x.client_status)}</span><span class="entity-pill">${typeLabel(x.entity_type)}</span><span>NIP: <b>${safe(x.nip||'—')}</b></span><span>REGON: <b>${safe(x.regon||'—')}</b></span>${!isJdg?`<span>KRS: <b>${safe(x.krs||'—')}</b></span>`:''}</div></div>
   </div>
 </div>

 <div class="client-profile-tabs">
   <button type="button" class="client-tab ${activeTab==='tax'?'active':''}" data-client-tab="tax">Dane podatkowe</button>
   <button type="button" class="client-tab ${activeTab==='notes'?'active':''}" data-client-tab="notes">Uwagi do rozliczeń <span id="clientNotesCount">${notes.length}</span></button>
 </div>

 <div id="clientTaxTab" class="${activeTab==='tax'?'':'hidden'}">
 <form id="clientProfileForm" class="client-profile-form">
   <section class="profile-section">
     <div class="profile-section-head"><div><h3>Dane kontaktowe i adresowe</h3><p>Adresy wykorzystywane w obsłudze księgowej i korespondencji.</p></div></div>
     <div class="profile-grid">
       <label>Status klienta
         <select name="client_status">
           <option value="active" ${(x.client_status||'active')==='active'?'selected':''}>Aktywny</option>
           <option value="suspended" ${x.client_status==='suspended'?'selected':''}>Zawieszony</option>
           <option value="inactive" ${x.client_status==='inactive'?'selected':''}>Nieobsługiwany</option>
           <option value="payment_hold" ${x.client_status==='payment_hold'?'selected':''}>Wstrzymany – zaległości płatnicze</option>
         </select>
       </label>
       <label class="${isJdg?'':'hidden'}">Adres zamieszkania<textarea name="residence_address" rows="3" placeholder="Ulica, numer, kod pocztowy, miejscowość">${safe(x.residence_address||'')}</textarea></label>
       <label>Adres działalności<textarea name="business_address" rows="3" placeholder="Ulica, numer, kod pocztowy, miejscowość">${safe(x.business_address||'')}</textarea></label>
       <label>Adres korespondencyjny<textarea name="correspondence_address" rows="3" placeholder="Jeżeli inny niż adres działalności">${safe(x.correspondence_address||'')}</textarea></label>
       <label>E-mail kontaktowy<input name="contact_email" type="email" value="${safe(x.contact_email||'')}" placeholder="klient@firma.pl"></label>
       <label>Język obsługi
         <select name="service_language">
           ${['Polski','Angielski','Niemiecki','Ukraiński','Inny'].map(v=>`<option ${(x.service_language||'Polski')===v?'selected':''}>${v}</option>`).join('')}
         </select>
       </label>
     </div>
   </section>

   <section class="profile-section">
     <div class="profile-section-head"><div><h3>Podatki i rozliczenia</h3><p>Podstawowe ustawienia podatkowe klienta.</p></div></div>
     <div class="profile-grid profile-grid-3">
       <label>Forma opodatkowania
         <select name="taxation_form">
           <option value="">Wybierz</option>
           ${['Skala podatkowa','Podatek liniowy','Ryczałt','Karta podatkowa','CIT 9%','CIT 19%','Estoński CIT','Inna'].map(v=>`<option ${x.taxation_form===v?'selected':''}>${v}</option>`).join('')}
         </select>
       </label>
       <label>VAT
         <select name="vat_status">
           <option value="">Wybierz</option>
           ${['VAT czynny','Zwolniony z VAT','Nie dotyczy'].map(v=>`<option ${x.vat_status===v?'selected':''}>${v}</option>`).join('')}
         </select>
       </label>
       <label>Forma ZUS
         <select name="zus_form">
           <option value="">Wybierz</option>
           ${['Ulga na start','Preferencyjny ZUS','Mały ZUS Plus','Pełny ZUS','Bez ZUS','Nie dotyczy','Inna'].map(v=>`<option ${x.zus_form===v?'selected':''}>${v}</option>`).join('')}
         </select>
       </label>
       <label>Cykl rozliczeń
         <select name="settlement_frequency">
           <option value="miesięcznie" ${(x.settlement_frequency||'miesięcznie')==='miesięcznie'?'selected':''}>Miesięcznie</option>
           <option value="kwartalnie" ${x.settlement_frequency==='kwartalnie'?'selected':''}>Kwartalnie</option>
         </select>
       </label>
       <label>Właściwy urząd skarbowy<input name="tax_office" value="${safe(x.tax_office||'')}" placeholder="np. Urząd Skarbowy Warszawa-Wola"></label>
     </div>
   </section>

   <section class="profile-section">
     <div class="profile-section-head"><div><h3>Daty i współpraca</h3><p>Najważniejsze daty dotyczące działalności i obsługi przez biuro.</p></div></div>
     <div class="profile-grid profile-grid-3">
       <label>Data startu działalności<input name="business_start_date" type="date" value="${x.business_start_date?String(x.business_start_date).slice(0,10):''}"></label>
       <label>Data rozpoczęcia współpracy<input name="cooperation_start_date" type="date" value="${x.cooperation_start_date?String(x.cooperation_start_date).slice(0,10):''}"></label>
     </div>
   </section>

   ${isJdg?`
   <section class="profile-section">
     <div class="profile-section-head"><div><h3>Dane właściciela JDG</h3><p>Dodatkowe dane osoby fizycznej prowadzącej działalność.</p></div></div>
     <div class="profile-owner-summary">
       <div><span>Imię</span><b>${safe(x.first_name||'—')}</b></div>
       <div><span>Nazwisko</span><b>${safe(x.last_name||'—')}</b></div>
       <div><span>PESEL</span><b>${safe(x.pesel||'—')}</b></div>
     </div>
     <div class="profile-grid profile-grid-3">
       <label>Imię ojca<input name="father_name" value="${safe(x.father_name||'')}"></label>
       <label>Imię matki<input name="mother_name" value="${safe(x.mother_name||'')}"></label>
     </div>
   </section>`:''}

   <div class="profile-save-bar">
     <span id="profileSaveStatus"></span>
     <button class="primary" type="submit">Zapisz kartę klienta</button>
   </div>
 </form>
 </div>

 <div id="clientNotesTab" class="${activeTab==='notes'?'':'hidden'}">
   <section class="profile-section settlement-notes-section">
     <div class="profile-section-head"><div><h3>Uwagi do rozliczeń</h3><p>Stała historia informacji ważnych przy księgowaniu i rozliczeniach klienta.</p></div></div>
     <form id="clientNoteForm" class="client-note-form">
       <textarea name="note" rows="4" required placeholder="Np. klient przesyła dokumenty do 5. dnia miesiąca, leasing rozliczamy 50% VAT..."></textarea>
       <div class="client-note-form-actions"><span id="clientNoteStatus"></span><button class="primary" type="submit">+ Dodaj uwagę</button></div>
     </form>
     <div class="client-notes-list" id="clientNotesList"></div>
   </section>
 </div>`;

 $('#backToClients').onclick=()=>{view='clients';localStorage.setItem('brcrm_view',view);render()};

 const switchTab=tab=>{
   activeTab=tab;localStorage.setItem('brcrm_client_tab',tab);
   document.querySelectorAll('[data-client-tab]').forEach(b=>b.classList.toggle('active',b.dataset.clientTab===tab));
   $('#clientTaxTab').classList.toggle('hidden',tab!=='tax');
   $('#clientNotesTab').classList.toggle('hidden',tab!=='notes');
 };
 document.querySelectorAll('[data-client-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.clientTab));

 const form=$('#clientProfileForm');
 form.onsubmit=async e=>{
   e.preventDefault();
   const fd=Object.fromEntries(new FormData(form)),status=$('#profileSaveStatus');
   status.textContent='Zapisywanie…';
   try{
     await api('/api/clients',{method:'PATCH',body:JSON.stringify({
       id:Number(x.id),
       residence_address:isJdg?(fd.residence_address||''):'',
       business_address:fd.business_address||'',
       correspondence_address:fd.correspondence_address||'',
       taxation_form:fd.taxation_form||'',
       vat_status:fd.vat_status||'',
       zus_form:fd.zus_form||'',
       business_start_date:fd.business_start_date||null,
       cooperation_start_date:fd.cooperation_start_date||null,
       father_name:isJdg?(fd.father_name||''):'',
       mother_name:isJdg?(fd.mother_name||''):'',
       tax_office:fd.tax_office||'',
       contact_email:fd.contact_email||'',
       service_language:fd.service_language||'Polski',
       settlement_frequency:fd.settlement_frequency||'miesięcznie',
       client_status:fd.client_status||'active'
     })});
     status.textContent='Zapisano ✓';
     setTimeout(()=>{if($('#profileSaveStatus'))$('#profileSaveStatus').textContent=''},2200);
   }catch(err){status.textContent='Błąd: '+err.message}
 };

 const notesList=$('#clientNotesList'),noteForm=$('#clientNoteForm');
 const drawNotes=()=>{
   $('#clientNotesCount').textContent=notes.length;
   notesList.innerHTML=notes.length?notes.map(n=>`
     <article class="settlement-note">
       <div class="settlement-note-head"><div><b>${safe(n.author_name||'Użytkownik')}</b><span>${new Date(n.created_at).toLocaleString('pl-PL')}</span></div><button type="button" class="delete-client-note" data-note-id="${n.id}">Usuń</button></div>
       <p>${safe(n.note).replace(/\n/g,'<br>')}</p>
     </article>`).join(''):'<div class="notes-empty">Brak uwag do rozliczeń. Dodaj pierwszą informację dla tego klienta.</div>';
   document.querySelectorAll('.delete-client-note').forEach(btn=>btn.onclick=async()=>{
     if(!confirm('Usunąć tę uwagę?'))return;
     try{
       await api('/api/client-notes?id='+btn.dataset.noteId,{method:'DELETE'});
       notes=notes.filter(n=>String(n.id)!==btn.dataset.noteId);drawNotes();
     }catch(err){$('#clientNoteStatus').textContent=err.message}
   });
 };
 noteForm.onsubmit=async e=>{
   e.preventDefault();
   const fd=Object.fromEntries(new FormData(noteForm)),status=$('#clientNoteStatus');
   status.textContent='Zapisywanie…';
   try{
     const created=await api('/api/client-notes',{method:'POST',body:JSON.stringify({client_id:Number(x.id),note:fd.note})});
     notes=[created,...notes];noteForm.reset();drawNotes();status.textContent='Dodano ✓';
     setTimeout(()=>{if($('#clientNoteStatus'))$('#clientNoteStatus').textContent=''},1800);
   }catch(err){status.textContent=err.message}
 };
 drawNotes();
}

async function pipeline(){
 await loadLeads();app.innerHTML=`<div class="board-tools"><input id="boardSearch" placeholder="Szukaj szansy..."><select id="boardSource"><option value="">Wszystkie źródła</option>${[...new Set(leads.map(l=>l.source))].map(s=>`<option>${s}</option>`).join('')}</select><select id="boardGrade"><option value="">Każdy segment</option><option>A</option><option>B</option><option>C</option></select></div><div id="pipelineBoard" class="pipeline"></div>`;
 const draw=()=>{const q=$('#boardSearch').value.toLowerCase(),src=$('#boardSource').value,gr=$('#boardGrade').value,base=currentUser.role==='employee'?leads.filter(l=>l.owner===currentEmployeeName()):leads,filtered=base.filter(l=>(!src||l.source===src)&&(!gr||l.grade===gr)&&(`${l.company} ${l.contact} ${l.owner}`.toLowerCase().includes(q)));$('#pipelineBoard').innerHTML=stages.map(s=>{const ls=filtered.filter(l=>l.stage===s),total=ls.reduce((a,l)=>a+Number(l.mrr||0),0);return `<div class="column"><div class="column-head"><div>${s}<span class="column-total">${money(total)} MRR</span></div><span class="count">${ls.length}</span></div><div class="column-body">${ls.map(card).join('')||'<div class="empty">Brak szans</div>'}</div></div>`}).join('');document.querySelectorAll('.lead-card').forEach(el=>el.onclick=()=>advance(Number(el.dataset.id)))};
 ['#boardSearch','#boardSource','#boardGrade'].forEach(sel=>$(sel).addEventListener('input',draw));draw();
}
function card(l){return `<div class="lead-card" data-id="${l.id}"><span class="more">⋮</span><h4>${l.company}</h4><p>${l.contact} • ${l.owner||'Nieprzypisany'}</p><div class="lead-price">${money(l.mrr)}</div><div class="lead-meta"><span>${l.followup||'brak terminu'} ${overdue(l.followup)?'<span class="overdue-badge">po terminie</span>':''}</span><span class="grade-dot grade-${l.grade.toLowerCase()}">${l.grade}</span></div></div>`}
async function advance(id){const l=leads.find(x=>x.id===id),i=stages.indexOf(l.stage);if(!l||i>=stages.length-1)return;await api('/api/leads',{method:'PATCH',body:JSON.stringify({id,stage:stages[i+1]})});await render()}

async function leadTable(){
 await loadLeads();
 app.innerHTML=`
 <div class="leads-toolbar">
   <div class="leads-toolbar-left">
     <div class="clients-search"><span>⌕</span><input id="q" placeholder="Szukaj po nazwie, e-mailu, źródle lub opiekunie..."></div>
     <select id="stageFilter" class="client-type-filter">
       <option value="">Wszystkie etapy</option>
       ${stages.map(s=>`<option value="${s}">${s}</option>`).join('')}
     </select>
     <select id="qualityFilter" class="client-type-filter">
       <option value="">Wszystkie oceny</option>
       <option value="Dobry">Dobry</option>
       <option value="Słaby">Słaby</option>
     </select>
     <select id="leadSort" class="client-type-filter">
       <option value="asc">Nazwa A–Z</option>
       <option value="desc">Nazwa Z–A</option>
     </select>
   </div>
 </div>
 <div class="leads-list-wrap">
   <div class="leads-list-head">
     <span>Lead</span><span>Status</span><span>Ocena</span><span>Źródło</span><span>E-mail</span><span>Etap</span><span>Opiekun</span>
   </div>
   <div class="leads-list" id="rows"></div>
 </div>`;

 const q=$('#q'),stageFilter=$('#stageFilter'),qualityFilter=$('#qualityFilter'),sortSelect=$('#leadSort');
 const draw=()=>{
   const term=q.value.toLowerCase().trim(),sf=stageFilter.value,qf=qualityFilter.value,sort=sortSelect.value;
   const base=currentUser.role==='employee'?leads.filter(l=>l.owner===currentEmployeeName()):leads;
   const filtered=base
     .filter(l=>(!sf||l.stage===sf)&&(!qf||l.lead_quality===qf)&&(`${l.company} ${l.email||''} ${l.source||''} ${l.owner||''} ${l.note||''}`.toLowerCase().includes(term)))
     .sort((a,b)=>String(a.company||'').localeCompare(String(b.company||''),'pl',{sensitivity:'base'})*(sort==='desc'?-1:1));

   $('#rows').innerHTML=filtered.length?filtered.map(l=>`
     <div class="lead-list-row">
       <div class="lead-list-main">
         <span class="lead-avatar">${initials(l.company)}</span>
         <div><button type="button" class="lead-name-link open-lead" data-id="${l.id}">${l.company}</button><small>${l.note||'Brak opisu leada'}</small></div>
       </div>
       <div><span class="lead-result-pill result-${l.lead_result||'in_progress'}">${l.lead_result==='won'?'Pozyskany':l.lead_result==='rejected'?'Odrzucony':'W trakcie'}</span></div>
       <div><span class="lead-quality-pill quality-${(l.lead_quality||'Dobry').toLowerCase().replace('ł','l')}">${l.lead_quality||'Dobry'}</span></div>
       <div>${l.source||'—'}</div>
       <div class="lead-email">${l.email||'—'}</div>
       <div><span class="lead-stage-pill">${l.stage||'Nowy lead'}</span></div>
       <div class="lead-owner">${l.owner||'Nieprzypisany'}</div>
     </div>`).join(''):'<div class="empty leads-empty">Brak leadów pasujących do filtrów.</div>';
   document.querySelectorAll('.open-lead').forEach(b=>b.onclick=()=>{selectedLeadId=Number(b.dataset.id);localStorage.setItem('brcrm_lead_id',String(selectedLeadId));view='leadDetail';localStorage.setItem('brcrm_view',view);render()});
 };

 q.oninput=draw;
 stageFilter.onchange=draw;
 qualityFilter.onchange=draw;
 sortSelect.onchange=draw;
 if(pendingOwnerFilter){q.value=pendingOwnerFilter;pendingOwnerFilter=null}
 draw();
}
async function leadDetailView(){
 if(!selectedLeadId){
   view='leads';localStorage.setItem('brcrm_view',view);return leadTable();
 }
 await loadLeads();
 const lead=leads.find(l=>Number(l.id)===Number(selectedLeadId));
 if(!lead){
   selectedLeadId=null;localStorage.removeItem('brcrm_lead_id');view='leads';localStorage.setItem('brcrm_view',view);return leadTable();
 }
 const [process,team]=await Promise.all([
   api('/api/lead-process?lead_id='+encodeURIComponent(selectedLeadId)),
   api('/api/team').catch(()=>[])
 ]);
 let items=process.items||[],events=process.events||[];
 const safe=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
 const resultLabel=r=>r==='won'?'Klient pozyskany':r==='rejected'?'Lead odrzucony':'W trakcie';
 const progress=()=>items.length?Math.round(items.filter(i=>i.is_done).length/items.length*100):0;

 title.textContent=lead.company;
 subtitle.textContent='Proces leada • '+resultLabel(lead.lead_result);
 crumb.textContent='CRM / Leady / '+lead.company;

 app.innerHTML=`
 <div class="lead-detail-head">
   <button class="back-client-btn" id="backToLeads">← Wróć do leadów</button>
   <div class="lead-detail-summary">
     <div class="lead-detail-identity">
       <span class="lead-avatar lead-avatar-large">${initials(lead.company)}</span>
       <div><h2>${safe(lead.company)}</h2><p>${safe(lead.email||'Brak e-maila')} • ${safe(lead.source||'Brak źródła')}</p></div>
     </div>
     <div class="lead-detail-badges">
       <span class="lead-result-pill result-${lead.lead_result||'in_progress'}">${resultLabel(lead.lead_result)}</span>
       <span class="lead-quality-pill quality-${(lead.lead_quality||'Dobry').toLowerCase().replace('ł','l')}">${safe(lead.lead_quality||'Dobry')}</span>
     </div>
   </div>
 </div>

 <div class="lead-process-grid">
   <div class="lead-process-main">
     <section class="lead-process-card">
       <div class="lead-process-card-head">
         <div><h3>Etap procesu</h3><p>Zmieniaj etap sprzedaży i osobę odpowiedzialną za lead.</p></div>
       </div>
       <div class="lead-process-controls">
         <label>Etap
           <select id="leadStageSelect">${stages.map(s=>`<option value="${s}" ${lead.stage===s?'selected':''}>${s}</option>`).join('')}</select>
         </label>
         <label>Opiekun leada
           ${currentUser.role==='employee'
             ?`<input value="${safe(lead.owner||currentEmployeeName())}" disabled>`
             :`<select id="leadOwnerSelect"><option value="Nieprzypisany">Nieprzypisany</option>${team.map(u=>`<option value="${safe(u.full_name)}" ${lead.owner===u.full_name?'selected':''}>${safe(u.full_name)}</option>`).join('')}</select>`}
         </label>
         <label>Przypomnij się, jeśli brak kontaktu
           <input id="leadFollowupDate" type="date" value="${lead.followup||''}">
         </label>
       </div>
     </section>

     <section class="lead-process-card">
       <div class="lead-process-card-head">
         <div><h3>Onboarding</h3><p>Odhaczaj wykonane kroki i przypisuj odpowiedzialność.</p></div>
         <div class="onboarding-progress"><b id="onboardingProgressText">${progress()}%</b><span>wykonano</span></div>
       </div>
       <div class="onboarding-progress-bar"><i id="onboardingProgressBar" style="width:${progress()}%"></i></div>
       <div class="onboarding-list" id="onboardingList"></div>
       <form id="addOnboardingItem" class="add-onboarding-item">
         <input name="title" placeholder="Dodaj własny punkt onboardingu..." required>
         <button class="secondary" type="submit">+ Dodaj punkt</button>
       </form>
     </section>

     <section class="lead-process-card">
       <div class="lead-process-card-head"><div><h3>Zakończenie procesu</h3><p>Oznacz rezultat dopiero, gdy onboarding jest zakończony lub lead został odrzucony.</p></div></div>
       <label class="lead-result-note">Komentarz do wyniku<textarea id="leadResultNote" rows="3" placeholder="Np. klient zaakceptował warunki / powód odrzucenia...">${safe(lead.result_note||'')}</textarea></label>
       <div class="lead-result-actions">
         <button type="button" class="result-action result-progress" data-result="in_progress">W trakcie</button>
         <button type="button" class="result-action result-won" data-result="won">✓ Klient pozyskany</button>
         <button type="button" class="result-action result-rejected" data-result="rejected">× Lead odrzucony</button>
       </div>
     </section>
   </div>

   <aside class="lead-timeline-card">
     <div class="lead-process-card-head"><div><h3>Oś czasu</h3><p>Historia zmian i wykonanych kroków.</p></div></div>
     <form id="addTimelineEvent" class="timeline-note-form">
       <input name="title" placeholder="Dodaj zdarzenie / notatkę..." required>
       <input name="detail" placeholder="Szczegóły (opcjonalnie)">
       <button class="secondary" type="submit">Dodaj do osi</button>
     </form>
     <div class="lead-timeline" id="leadTimeline"></div>
   </aside>
 </div>`;

 $('#backToLeads').onclick=()=>{view='leads';localStorage.setItem('brcrm_view',view);render()};

 const drawItems=()=>{
   const p=progress();$('#onboardingProgressText').textContent=p+'%';$('#onboardingProgressBar').style.width=p+'%';
   $('#onboardingList').innerHTML=items.map(item=>`
     <div class="onboarding-item ${item.is_done?'is-done':''}">
       <label class="onboarding-check"><input type="checkbox" data-onboarding-check="${item.id}" ${item.is_done?'checked':''}><span></span></label>
       <div class="onboarding-copy"><b>${safe(item.title)}</b><small>${item.completed_at?'Wykonano: '+new Date(item.completed_at).toLocaleString('pl-PL'):'Do wykonania'}</small></div>
       <select class="onboarding-assignee" data-onboarding-assignee="${item.id}">
         <option value="">Nieprzypisany</option>
         ${team.map(u=>`<option value="${u.id}" ${Number(item.assignee_user_id)===Number(u.id)?'selected':''}>${safe(u.full_name)}</option>`).join('')}
       </select>
       <button type="button" class="delete-onboarding-item" data-onboarding-delete="${item.id}">×</button>
     </div>`).join('');

   document.querySelectorAll('[data-onboarding-check]').forEach(el=>el.onchange=async()=>{
     const id=Number(el.dataset.onboardingCheck);
     try{
       const updated=await api('/api/lead-process',{method:'PATCH',body:JSON.stringify({lead_id:Number(lead.id),id,is_done:el.checked})});
       items=items.map(i=>Number(i.id)===id?updated:i);
       const refreshed=await api('/api/lead-process?lead_id='+lead.id);events=refreshed.events||events;drawItems();drawTimeline();
     }catch(e){alert(e.message);el.checked=!el.checked}
   });
   document.querySelectorAll('[data-onboarding-assignee]').forEach(el=>el.onchange=async()=>{
     const id=Number(el.dataset.onboardingAssignee);
     try{
       const updated=await api('/api/lead-process',{method:'PATCH',body:JSON.stringify({lead_id:Number(lead.id),id,assignee_user_id:el.value?Number(el.value):null})});
       items=items.map(i=>Number(i.id)===id?updated:i);
       const refreshed=await api('/api/lead-process?lead_id='+lead.id);events=refreshed.events||events;drawTimeline();
     }catch(e){alert(e.message)}
   });
   document.querySelectorAll('[data-onboarding-delete]').forEach(btn=>btn.onclick=async()=>{
     if(!confirm('Usunąć ten punkt onboardingu?'))return;
     try{
       await api('/api/lead-process?lead_id='+lead.id+'&id='+btn.dataset.onboardingDelete,{method:'DELETE'});
       items=items.filter(i=>String(i.id)!==btn.dataset.onboardingDelete);
       const refreshed=await api('/api/lead-process?lead_id='+lead.id);events=refreshed.events||events;drawItems();drawTimeline();
     }catch(e){alert(e.message)}
   });
 };

 const drawTimeline=()=>{
   $('#leadTimeline').innerHTML=events.length?events.map(e=>`
     <div class="lead-timeline-item event-${safe(e.event_type)}">
       <span class="timeline-dot"></span>
       <div><div class="timeline-meta"><b>${safe(e.title)}</b><time>${new Date(e.occurred_at).toLocaleString('pl-PL')}</time></div>
       ${e.detail?`<p>${safe(e.detail)}</p>`:''}<small>${safe(e.actor_name||'System')}</small></div>
     </div>`).join(''):'<div class="notes-empty">Brak zdarzeń.</div>';
 };

 $('#addOnboardingItem').onsubmit=async e=>{
   e.preventDefault();const fd=Object.fromEntries(new FormData(e.target));
   try{
     const created=await api('/api/lead-process',{method:'POST',body:JSON.stringify({lead_id:Number(lead.id),action:'add_item',title:fd.title})});
     items=[...items,created];e.target.reset();
     const refreshed=await api('/api/lead-process?lead_id='+lead.id);events=refreshed.events||events;drawItems();drawTimeline();
   }catch(err){alert(err.message)}
 };

 $('#addTimelineEvent').onsubmit=async e=>{
   e.preventDefault();const fd=Object.fromEntries(new FormData(e.target));
   try{
     const created=await api('/api/lead-process',{method:'POST',body:JSON.stringify({lead_id:Number(lead.id),action:'add_event',title:fd.title,detail:fd.detail})});
     events=[created,...events];e.target.reset();drawTimeline();
   }catch(err){alert(err.message)}
 };

 $('#leadStageSelect').onchange=async e=>{
   try{
     await api('/api/leads',{method:'PATCH',body:JSON.stringify({id:Number(lead.id),stage:e.target.value})});
     lead.stage=e.target.value;
     const refreshed=await api('/api/lead-process?lead_id='+lead.id);events=refreshed.events||events;drawTimeline();
   }catch(err){alert(err.message)}
 };
 if($('#leadOwnerSelect'))$('#leadOwnerSelect').onchange=async e=>{
   try{
     await api('/api/leads',{method:'PATCH',body:JSON.stringify({id:Number(lead.id),owner:e.target.value})});
     lead.owner=e.target.value;
     const refreshed=await api('/api/lead-process?lead_id='+lead.id);events=refreshed.events||events;drawTimeline();
   }catch(err){alert(err.message)}
 };
 $('#leadFollowupDate').onchange=async e=>{
   try{
     const updated=await api('/api/leads',{method:'PATCH',body:JSON.stringify({id:Number(lead.id),followup:e.target.value})});
     lead.followup=updated.followup;
     await api('/api/lead-process',{method:'POST',body:JSON.stringify({
       lead_id:Number(lead.id),
       action:'add_event',
       title:e.target.value?'Ustawiono przypomnienie o braku kontaktu':'Usunięto termin przypomnienia',
       detail:e.target.value?new Date(e.target.value+'T12:00:00').toLocaleDateString('pl-PL'):''
     })}).catch(()=>{});
     const refreshed=await api('/api/lead-process?lead_id='+lead.id);events=refreshed.events||events;drawTimeline();
     await refreshNotifications();
   }catch(err){alert(err.message)}
 };

 document.querySelectorAll('[data-result]').forEach(btn=>btn.onclick=async()=>{
   const result=btn.dataset.result,note=$('#leadResultNote').value.trim();
   if(result==='won'&&progress()<100&&!confirm('Checklista nie jest jeszcze ukończona w 100%. Oznaczyć lead jako pozyskany mimo to?'))return;
   if(result==='rejected'&&!note&&!confirm('Nie podano powodu odrzucenia. Kontynuować?'))return;
   try{
     const updated=await api('/api/leads',{method:'PATCH',body:JSON.stringify({id:Number(lead.id),lead_result:result,result_note:note})});
     lead.lead_result=updated.lead_result;lead.stage=updated.stage;lead.result_note=updated.result_note;
     await render();
   }catch(err){alert(err.message)}
 });

 drawItems();drawTimeline();
}

async function meetingsView(){
 const safe=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
 let cursorRaw=localStorage.getItem('brcrm_meeting_month');
 let cursor=cursorRaw?new Date(cursorRaw+'T12:00:00'):new Date();
 if(Number.isNaN(cursor.getTime()))cursor=new Date();
 cursor=new Date(cursor.getFullYear(),cursor.getMonth(),1,12);
 const clients=await api('/api/clients').catch(()=>[]);
 await loadLeads().catch(()=>{});

 const monthKey=()=>cursor.getFullYear()+'-'+String(cursor.getMonth()+1).padStart(2,'0');
 const monthStart=()=>monthKey()+'-01';
 const monthEnd=()=>new Date(cursor.getFullYear(),cursor.getMonth()+1,0,12).toISOString().slice(0,10);
 let meetings=await api('/api/meetings?from='+monthStart()+'&to='+monthEnd());

 app.innerHTML=`
 <div class="calendar-shell">
   <div class="calendar-top">
     <div>
       <h2 id="calendarMonthTitle"></h2>
       <p>Kliknij dzień, aby zaplanować spotkanie.</p>
     </div>
     <div class="calendar-nav">
       <button type="button" id="calendarToday">Dzisiaj</button>
       <button type="button" id="calendarPrev" aria-label="Poprzedni miesiąc">←</button>
       <button type="button" id="calendarNext" aria-label="Następny miesiąc">→</button>
       <button type="button" class="primary" id="calendarAdd">+ Nowe spotkanie</button>
     </div>
   </div>
   <div class="calendar-weekdays">
     <span>Pon</span><span>Wt</span><span>Śr</span><span>Czw</span><span>Pt</span><span>Sob</span><span>Nd</span>
   </div>
   <div class="calendar-grid" id="calendarGrid"></div>
 </div>

 <div class="meeting-panel hidden" id="meetingPanel">
   <div class="meeting-card">
     <div class="modal-head"><div><h2>Nowe spotkanie</h2><p id="meetingPanelDate"></p></div><button type="button" id="closeMeetingPanel">×</button></div>
     <form id="meetingForm">
       <div class="grid2">
         <label>Data<input type="date" name="meeting_date" required></label>
         <label>Godzina<input type="time" name="start_time" required value="10:00"></label>
       </div>
       <label>Tytuł spotkania<input name="title" required placeholder="np. Omówienie rozliczenia za wrzesień"></label>
       <div class="grid2">
         <label>Klient<select name="client_id"><option value="">— bez klienta —</option>${clients.map(x=>`<option value="${x.id}">${safe(x.name)}</option>`).join('')}</select></label>
         <label>Lead<select name="lead_id"><option value="">— bez leada —</option>${leads.map(x=>`<option value="${x.id}">${safe(x.company)}</option>`).join('')}</select></label>
       </div>
       <label>Notatka<textarea name="note" rows="4" placeholder="Temat rozmowy, dokumenty do przygotowania, ustalenia..."></textarea></label>
       <button class="primary wide">Zapisz spotkanie</button>
       <div class="auth-error hidden" id="meetingError"></div>
     </form>
   </div>
 </div>

 <div class="meeting-panel hidden" id="meetingDetailPanel">
   <div class="meeting-card meeting-detail-card">
     <div class="modal-head"><div><h2 id="meetingDetailTitle">Spotkanie</h2><p id="meetingDetailWhen"></p></div><button type="button" id="closeMeetingDetail">×</button></div>
     <div class="meeting-detail-body" id="meetingDetailBody"></div>
     <div class="meeting-detail-actions"><button type="button" class="danger-ghost" id="deleteMeeting">Usuń spotkanie</button></div>
   </div>
 </div>`;

 const grid=$('#calendarGrid'),panel=$('#meetingPanel'),form=$('#meetingForm');
 const monthTitle=$('#calendarMonthTitle');
 const detailPanel=$('#meetingDetailPanel');
 let selectedMeetingId=null;

 const monthNames=['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
 const pad=n=>String(n).padStart(2,'0');
 const dateKey=(y,m,d)=>y+'-'+pad(m+1)+'-'+pad(d);
 const todayKey=()=>{const d=new Date();return dateKey(d.getFullYear(),d.getMonth(),d.getDate())};

 const drawCalendar=()=>{
   monthTitle.textContent=monthNames[cursor.getMonth()]+' '+cursor.getFullYear();
   const year=cursor.getFullYear(),month=cursor.getMonth();
   const first=new Date(year,month,1,12);
   const days=new Date(year,month+1,0,12).getDate();
   const offset=(first.getDay()+6)%7;
   const cells=[];
   for(let i=0;i<offset;i++)cells.push('<div class="calendar-day is-empty"></div>');
   for(let day=1;day<=days;day++){
     const key=dateKey(year,month,day);
     const dayMeetings=meetings.filter(m=>m.meeting_date===key);
     cells.push(`<button type="button" class="calendar-day ${key===todayKey()?'is-today':''}" data-calendar-date="${key}">
       <span class="calendar-day-number">${day}</span>
       <span class="calendar-events">
         ${dayMeetings.slice(0,3).map(m=>`<span class="calendar-event" data-meeting-id="${m.id}"><b>${String(m.start_time||'').slice(0,5)}</b> ${safe(m.title)}</span>`).join('')}
         ${dayMeetings.length>3?`<span class="calendar-more">+${dayMeetings.length-3} więcej</span>`:''}
       </span>
     </button>`);
   }
   while(cells.length%7)cells.push('<div class="calendar-day is-empty"></div>');
   grid.innerHTML=cells.join('');

   document.querySelectorAll('[data-calendar-date]').forEach(day=>day.onclick=e=>{
     const event=e.target.closest('[data-meeting-id]');
     if(event){e.stopPropagation();openMeetingDetail(Number(event.dataset.meetingId));return}
     openMeetingForm(day.dataset.calendarDate);
   });
   document.querySelectorAll('[data-meeting-id]').forEach(event=>event.onclick=e=>{
     e.stopPropagation();openMeetingDetail(Number(event.dataset.meetingId));
   });
 };

 const reloadMonth=async()=>{
   localStorage.setItem('brcrm_meeting_month',monthKey());
   meetings=await api('/api/meetings?from='+monthStart()+'&to='+monthEnd());
   drawCalendar();
 };

 const openMeetingForm=date=>{
   form.reset();
   form.meeting_date.value=date||todayKey();
   form.start_time.value='10:00';
   $('#meetingPanelDate').textContent=new Date((date||todayKey())+'T12:00:00').toLocaleDateString('pl-PL',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
   $('#meetingError').classList.add('hidden');
   panel.classList.remove('hidden');
 };
 const openMeetingDetail=id=>{
   const m=meetings.find(x=>Number(x.id)===id);if(!m)return;
   selectedMeetingId=id;
   $('#meetingDetailTitle').textContent=m.title;
   $('#meetingDetailWhen').textContent=new Date(m.meeting_date+'T12:00:00').toLocaleDateString('pl-PL',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+' • '+String(m.start_time||'').slice(0,5);
   $('#meetingDetailBody').innerHTML=`
     <div><span>Powiązanie</span><b>${safe(m.client_name||m.lead_name||'Bez powiązania')}</b></div>
     <div><span>Opiekun</span><b>${safe(m.owner_name||'—')}</b></div>
     ${m.note?`<div class="meeting-detail-note"><span>Notatka</span><p>${safe(m.note).replace(/\n/g,'<br>')}</p></div>`:''}`;
   detailPanel.classList.remove('hidden');
 };

 $('#calendarPrev').onclick=async()=>{cursor=new Date(cursor.getFullYear(),cursor.getMonth()-1,1,12);await reloadMonth()};
 $('#calendarNext').onclick=async()=>{cursor=new Date(cursor.getFullYear(),cursor.getMonth()+1,1,12);await reloadMonth()};
 $('#calendarToday').onclick=async()=>{const n=new Date();cursor=new Date(n.getFullYear(),n.getMonth(),1,12);await reloadMonth()};
 $('#calendarAdd').onclick=()=>openMeetingForm(todayKey());
 $('#closeMeetingPanel').onclick=()=>panel.classList.add('hidden');
 $('#closeMeetingDetail').onclick=()=>detailPanel.classList.add('hidden');

 form.client_id.onchange=()=>{if(form.client_id.value)form.lead_id.value=''};
 form.lead_id.onchange=()=>{if(form.lead_id.value)form.client_id.value=''};

 form.onsubmit=async e=>{
   e.preventDefault();
   const fd=Object.fromEntries(new FormData(form)),err=$('#meetingError');
   err.classList.add('hidden');
   try{
     await api('/api/meetings',{method:'POST',body:JSON.stringify(fd)});
     panel.classList.add('hidden');
     const selected=new Date(fd.meeting_date+'T12:00:00');
     if(selected.getFullYear()!==cursor.getFullYear()||selected.getMonth()!==cursor.getMonth())cursor=new Date(selected.getFullYear(),selected.getMonth(),1,12);
     await reloadMonth();
   }catch(x){err.textContent=x.message;err.classList.remove('hidden')}
 };

 $('#deleteMeeting').onclick=async()=>{
   if(!selectedMeetingId||!confirm('Usunąć to spotkanie?'))return;
   try{
     await api('/api/meetings?id='+selectedMeetingId,{method:'DELETE'});
     detailPanel.classList.add('hidden');selectedMeetingId=null;await reloadMonth();
   }catch(e){alert(e.message)}
 };

 drawCalendar();
}

async function remindersView(){
 await loadLeads();
 const manual=await api('/api/modules?module=reminders').catch(()=>[]);
 const today=new Date().toISOString().slice(0,10);
 const base=currentUser.role==='employee'?leads.filter(l=>l.owner===currentEmployeeName()):leads;
 const leadReminders=base.filter(l=>l.followup&&!['Wygrany','Przegrany'].includes(l.stage))
   .map(l=>({
     kind:'lead',
     id:l.id,
     title:l.company,
     detail:'Przypomnij się w sprawie braku kontaktu',
     date:l.followup,
     owner:l.owner||'Nieprzypisany',
     overdue:l.followup<today
   }))
   .sort((a,b)=>String(a.date).localeCompare(String(b.date)));

 app.innerHTML=`
 <div class="reminders-head">
   <div><h2>Przypomnienia</h2><p>Terminy follow-upów leadów oraz ręczne przypomnienia.</p></div>
   <button class="secondary" id="addManualReminder">+ Dodaj ręczne przypomnienie</button>
 </div>
 <div class="reminders-layout">
   <section class="reminders-card">
     <div class="reminders-section-title"><h3>Brak kontaktu / follow-up</h3><span>${leadReminders.length}</span></div>
     <div class="reminders-list">
       ${leadReminders.length?leadReminders.map(r=>`
         <button type="button" class="reminder-row ${r.overdue?'is-overdue':''}" data-reminder-lead="${r.id}">
           <span class="reminder-date"><b>${new Date(r.date+'T12:00:00').toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit'})}</b><small>${new Date(r.date+'T12:00:00').getFullYear()}</small></span>
           <span class="reminder-copy"><b>${r.title}</b><small>${r.detail} • ${r.owner}</small></span>
           <span class="reminder-state">${r.overdue?'Po terminie':r.date===today?'Dzisiaj':'Zaplanowane'}</span>
         </button>`).join(''):'<div class="notes-empty">Brak zaplanowanych follow-upów.</div>'}
     </div>
   </section>

   <section class="reminders-card">
     <div class="reminders-section-title"><h3>Ręczne przypomnienia</h3><span>${manual.length}</span></div>
     <div class="reminders-list">
       ${manual.length?manual.map(r=>`
         <div class="reminder-row manual">
           <span class="reminder-date"><b>•</b></span>
           <span class="reminder-copy"><b>${r.title}</b><small>${r.detail||''}</small></span>
           <button type="button" class="delete-item" data-id="${r.id}">×</button>
         </div>`).join(''):'<div class="notes-empty">Brak ręcznych przypomnień.</div>'}
     </div>
   </section>
 </div>`;

 document.querySelectorAll('[data-reminder-lead]').forEach(b=>b.onclick=()=>{
   selectedLeadId=Number(b.dataset.reminderLead);
   localStorage.setItem('brcrm_lead_id',String(selectedLeadId));
   view='leadDetail';localStorage.setItem('brcrm_view',view);render();
 });
 document.querySelectorAll('.delete-item').forEach(b=>b.onclick=async()=>{
   await api('/api/modules?module=reminders&id='+b.dataset.id,{method:'DELETE'});await remindersView();
 });
 $('#addManualReminder').onclick=async()=>{
   const t=prompt('Nazwa przypomnienia:');if(!t)return;
   const d=prompt('Opis / termin:')||'';
   await api('/api/modules',{method:'POST',body:JSON.stringify({module:'reminders',title:t,detail:d})});
   await remindersView();
 };
}

async function genericModule(key){
 const rows=await api('/api/modules?module='+encodeURIComponent(key));app.innerHTML=`<div class="module-actions"><button class="secondary" id="addModule">+ Dodaj</button><input id="moduleSearch" placeholder="Szukaj..."></div><div class="module-grid" id="moduleGrid"></div>`;
 const draw=()=>{const q=$('#moduleSearch').value.toLowerCase();$('#moduleGrid').innerHTML=rows.filter(r=>(r.title+' '+r.detail+' '+r.status).toLowerCase().includes(q)).map(r=>`<div class="module-card"><div class="module-icon">#</div><div><b>${r.title}</b><span>${r.detail||r.status||''}</span></div><button class="delete-item" data-id="${r.id}">×</button></div>`).join('')||'<div class="empty card">Brak danych.</div>';document.querySelectorAll('.delete-item').forEach(b=>b.onclick=async()=>{await api('/api/modules?module='+encodeURIComponent(key)+'&id='+b.dataset.id,{method:'DELETE'});await render()})};
 $('#moduleSearch').oninput=draw;$('#addModule').onclick=async()=>{const t=prompt('Nazwa / tytuł:');if(!t)return;const d=prompt('Opis / status:')||'';await api('/api/modules',{method:'POST',body:JSON.stringify({module:key,title:t,detail:d})});await render()};draw();
}

function notificationKey(n){return [n.type,n.id||'',n.title,n.date||''].join(':')}
function readNotifications(){try{return new Set(JSON.parse(localStorage.getItem('brcrm.readNotifications')||'[]'))}catch{return new Set()}}
function saveReadNotifications(set){localStorage.setItem('brcrm.readNotifications',JSON.stringify([...set]))}
async function buildNotifications(){
 await loadLeads();const reminders=await api('/api/modules?module=reminders').catch(()=>[]),today=new Date().toISOString().slice(0,10),base=currentUser.role==='employee'?leads.filter(l=>l.owner===currentEmployeeName()):leads,items=[];
 base.forEach(l=>{if(l.followup&&l.followup<today&&!['Wygrany','Przegrany'].includes(l.stage))items.push({type:'overdue',id:l.id,title:'Zaległy follow-up',detail:l.company,date:l.followup,view:'leadDetail',priority:3});if(l.followup===today&&!['Wygrany','Przegrany'].includes(l.stage))items.push({type:'today',id:l.id,title:'Follow-up na dziś',detail:l.company,date:l.followup,view:'leadDetail',priority:2});if((!l.owner||l.owner==='Nieprzypisany')&&currentUser.role!=='employee'&&!['Wygrany','Przegrany'].includes(l.stage))items.push({type:'owner',id:l.id,title:'Lead bez opiekuna',detail:l.company,date:l.created_at,view:'leads',priority:2})});
 reminders.slice(0,10).forEach(r=>items.push({type:'reminder',id:r.id,title:r.title||'Przypomnienie',detail:r.detail||'',date:r.created_at,view:'reminders',priority:1}));
 return items.sort((a,b)=>b.priority-a.priority).slice(0,20);
}
async function refreshNotifications(){
 if(!currentUser)return;
 try{const items=await buildNotifications(),read=readNotifications(),unread=items.filter(n=>!read.has(notificationKey(n))).length;notificationBadge.textContent=unread>99?'99+':String(unread);notificationBadge.classList.toggle('hidden-badge',unread===0);notificationSummary.textContent=unread===1?'1 nowe':unread+' nowych';notificationList.innerHTML=items.length?items.map(n=>{const key=notificationKey(n),isRead=read.has(key);return `<button class="notification-item ${isRead?'is-read':''}" data-notification-key="${encodeURIComponent(key)}" data-notification-view="${n.view}"><span class="notification-icon">!</span><span class="notification-copy"><b>${n.title}</b><small>${n.detail}</small></span><span class="notification-time">${n.date?datePL(n.date):''}</span></button>`}).join(''):'<div class="notification-empty">Wszystko ogarnięte 🎉<small>Nie masz teraz żadnych alertów.</small></div>';notificationList.querySelectorAll('.notification-item').forEach(el=>el.onclick=()=>{const set=readNotifications();set.add(decodeURIComponent(el.dataset.notificationKey));saveReadNotifications(set);notificationPanel.classList.add('hidden');view=el.dataset.notificationView||'dashboard';if(view==='leadDetail'){const key=decodeURIComponent(el.dataset.notificationKey),parts=key.split(':');selectedLeadId=Number(parts[1])||null;if(selectedLeadId)localStorage.setItem('brcrm_lead_id',String(selectedLeadId))}render();refreshNotifications()})}catch(e){notificationBadge.textContent='!'}
}
notificationBtn.onclick=async e=>{e.stopPropagation();employeePanel.classList.add('hidden');notificationPanel.classList.toggle('hidden');if(!notificationPanel.classList.contains('hidden'))await refreshNotifications()};
$('#markAllRead').onclick=async()=>{const items=await buildNotifications(),set=readNotifications();items.forEach(n=>set.add(notificationKey(n)));saveReadNotifications(set);await refreshNotifications()};

async function refreshEmployeePanel(){
 try{await loadLeads();const mine=leads.filter(l=>l.owner===currentEmployeeName()),today=new Date().toISOString().slice(0,10),active=mine.filter(l=>!['Wygrany','Przegrany'].includes(l.stage)),followups=mine.filter(l=>l.followup===today).length,stats=await api('/api/stats?owner='+encodeURIComponent(currentEmployeeName())).catch(()=>null);employeeStats.innerHTML=`<div><span>Aktywne leady</span><b>${active.length}</b></div><div><span>Follow-upy dziś</span><b>${followups}</b></div><div><span>Wygrany MRR</span><b>${money(stats?.totals?.won_mrr||0)}</b></div>`;employeeLeadList.innerHTML=active.slice(0,4).map(l=>`<button class="employee-lead"><span class="avatar-mini">${initials(l.company)}</span><span><b>${l.company}</b><small>${l.stage} • ${money(l.mrr)}</small></span><i>→</i></button>`).join('')||'<div class="employee-empty">Brak aktywnych leadów przypisanych do Ciebie.</div>'}catch(e){employeeStats.innerHTML='<div class="employee-empty">Nie udało się pobrać danych.</div>'}
}
employeeBtn.onclick=async e=>{e.stopPropagation();notificationPanel.classList.add('hidden');employeePanel.classList.toggle('hidden');if(!employeePanel.classList.contains('hidden'))await refreshEmployeePanel()};
$('#employeeAllLeads').onclick=()=>{employeePanel.classList.add('hidden');pendingOwnerFilter=currentEmployeeName();view='leads';render()};
document.querySelectorAll('[data-employee-action]').forEach(b=>b.onclick=()=>{employeePanel.classList.add('hidden');const a=b.dataset.employeeAction;if(a==='leads'){pendingOwnerFilter=currentEmployeeName();view='leads'}if(a==='stats'){pendingOwnerFilter=currentEmployeeName();view='stats'}if(a==='reminders')view='reminders';render()});
document.addEventListener('click',e=>{if(!e.target.closest('.notification-wrap'))notificationPanel.classList.add('hidden');if(!e.target.closest('.employee-wrap'))employeePanel.classList.add('hidden')});

document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{view=b.dataset.view;localStorage.setItem('brcrm_view',view);render()});
const modal=$('#modal');addLeadBtn.onclick=()=>modal.classList.remove('hidden');$('#closeModal').onclick=()=>modal.classList.add('hidden');
$('#leadForm').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));try{await api('/api/leads',{method:'POST',body:JSON.stringify({...d,stage:'Nowy lead'})});e.target.reset();modal.classList.add('hidden');await api('/api/modules',{method:'POST',body:JSON.stringify({module:'history',title:'Dodano lead',detail:d.company})}).catch(()=>{});await render();await refreshNotifications()}catch(err){alert(err.message)}};
$('#globalSearch').oninput=async e=>{const q=e.target.value.trim();if(q.length<2)return;try{await loadLeads();const base=currentUser.role==='employee'?leads.filter(l=>l.owner===currentEmployeeName()):leads;if(base.some(l=>(l.company+' '+l.contact+' '+l.email+' '+l.owner).toLowerCase().includes(q.toLowerCase()))){view='leads';await render();const inp=$('#q');if(inp){inp.value=q;inp.dispatchEvent(new Event('input'))}}}catch{}};

bootAuth();