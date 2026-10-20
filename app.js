const stages=['Nowy lead','Do kontaktu','Kontakt wykonany','Kwalifikacja','Oferta','Follow-up','Wygrany','Przegrany'];
let leads=[],view='dashboard',currentUser=null,pendingOwnerFilter=null;

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
 emails:['Wiadomości e-mail','Robocza skrzynka i status korespondencji.'],
 clients:['Klienci','Aktywni klienci biura rachunkowego.'],
 leads:['Leady / Potencjalni klienci','Pełna lista kontaktów sprzedażowych.'],
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
 view='dashboard';
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
 document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 const [t,s]=labels[view]||[view,''];title.textContent=t;subtitle.textContent=s;
 crumb.textContent=(['dashboard','stats','users','history','reminders','emails'].includes(view)?'OGÓLNE / ':'CRM / ')+t;
 addLeadBtn.style.display=['dashboard','pipeline','leads'].includes(view)?'inline-block':'none';
 loading();
 try{
   if(view==='dashboard')return await dashboard();
   if(view==='stats')return await statsView();
   if(view==='users')return await usersView();
   if(view==='clients')return await clientsView();
   if(view==='pipeline')return await pipeline();
   if(view==='leads')return await leadTable();
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
function bindDashboardActions(){document.querySelectorAll('[data-view-link]').forEach(b=>b.onclick=()=>{view=b.dataset.viewLink;render()});document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{const a=b.dataset.action;if(a==='new-lead')return $('#modal').classList.remove('hidden');const map={task:'reminders',meeting:'reminders',message:'emails',onboarding:'clients',docs:'notes',offer:'offers',note:'notes',contact:'leads'};view=map[a]||'dashboard';render()})}

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
   <div class="clients-search"><span>⌕</span><input id="clientSearch" placeholder="Szukaj po nazwie, osobie, NIP lub KRS..."></div>
   <button class="primary" id="openClientForm">+ Dodaj klienta</button>
 </div>
 <div class="clients-grid" id="clientsGrid"></div>
 <div class="client-form-panel hidden" id="clientFormPanel">
   <div class="client-form-card">
     <div class="modal-head"><div><h2 id="clientFormTitle">Nowy klient</h2><p>Uzupełnij dane klienta lub pobierz dane rejestrowe z GUS.</p></div><button id="closeClientForm">×</button></div>
     <form id="clientForm">
       <input type="hidden" name="id">
       <div class="grid2">
         <label>Nazwa firmy / działalności<input name="name" required placeholder="np. ABC Consulting"></label>
         <label>Imię i nazwisko<input name="contact_name" required placeholder="np. Jan Kowalski"></label>
       </div>
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
         <label id="peselField">PESEL<input name="pesel" inputmode="numeric" maxlength="11" placeholder="11 cyfr"></label>
         <label id="krsField" class="hidden">KRS<div class="lookup-field"><input name="krs" inputmode="numeric" maxlength="10" placeholder="Numer KRS"><button type="button" class="gus-btn" data-gus="krs">Pobierz dane</button></div></label>
       </div>
       <div class="gus-status hidden" id="gusStatus"></div>
       <button class="primary wide">Zapisz klienta</button>
       <div class="auth-error hidden" id="clientFormError"></div>
     </form>
   </div>
 </div>`;
 const grid=$('#clientsGrid'),panel=$('#clientFormPanel'),form=$('#clientForm'),q=$('#clientSearch');
 const typeLabel=t=>t==='jdg'?'JDG':t==='company'?'Spółka':'Fundacja';
 const draw=()=>{const term=q.value.toLowerCase().trim();const filtered=clients.filter(x=>(x.name+' '+x.contact_name+' '+x.nip+' '+(x.krs||'')+' '+(x.pesel||'')).toLowerCase().includes(term));grid.innerHTML=filtered.length?filtered.map(x=>`
   <article class="client-card">
     <div class="client-card-top"><span class="client-avatar">${initials(x.name)}</span><div><h3>${x.name}</h3><p>${x.contact_name}</p></div><span class="entity-pill">${typeLabel(x.entity_type)}</span></div>
     <div class="client-identifiers"><div><span>NIP</span><b>${x.nip}</b></div>${x.entity_type==='jdg'? `<div><span>PESEL</span><b>${x.pesel||'—'}</b></div>`:`<div><span>KRS</span><b>${x.krs||'—'}</b></div>`}</div>
     <div class="client-card-actions"><button class="secondary edit-client" data-id="${x.id}">Edytuj</button>${currentUser.role!=='employee'? `<button class="danger-ghost delete-client" data-id="${x.id}">Usuń</button>`:''}</div>
   </article>`).join(''):'<div class="empty card clients-empty">Brak klientów pasujących do wyszukiwania.</div>';
   document.querySelectorAll('.edit-client').forEach(b=>b.onclick=()=>openEdit(Number(b.dataset.id)));
   document.querySelectorAll('.delete-client').forEach(b=>b.onclick=async()=>{if(!confirm('Usunąć tego klienta?'))return;await api('/api/clients?id='+b.dataset.id,{method:'DELETE'});await clientsView()});
 };
 const setEntity=type=>{form.entity_type.value=type;document.querySelectorAll('[data-entity]').forEach(b=>b.classList.toggle('active',b.dataset.entity===type));$('#peselField').classList.toggle('hidden',type!=='jdg');$('#krsField').classList.toggle('hidden',type==='jdg');form.pesel.required=type==='jdg';form.krs.required=type!=='jdg'};
 const openNew=()=>{form.reset();form.id.value='';setEntity('jdg');$('#gusStatus').classList.add('hidden');$('#clientFormTitle').textContent='Nowy klient';panel.classList.remove('hidden')};
 const openEdit=id=>{const x=clients.find(v=>Number(v.id)===id);if(!x)return;form.id.value=x.id;form.name.value=x.name;form.contact_name.value=x.contact_name;form.nip.value=x.nip||'';form.pesel.value=x.pesel||'';form.krs.value=x.krs||'';setEntity(x.entity_type);$('#gusStatus').classList.add('hidden');$('#clientFormTitle').textContent='Edytuj klienta';panel.classList.remove('hidden')};
 $('#openClientForm').onclick=openNew;$('#closeClientForm').onclick=()=>panel.classList.add('hidden');q.oninput=draw;
 document.querySelectorAll('[data-entity]').forEach(b=>b.onclick=()=>setEntity(b.dataset.entity));
 document.querySelectorAll('[data-gus]').forEach(b=>b.onclick=async()=>{const kind=b.dataset.gus,val=String(form[kind].value||'').replace(/\D/g,''),status=$('#gusStatus');if(!val){status.textContent='Najpierw wpisz '+kind.toUpperCase()+'.';status.className='gus-status error';return}b.disabled=true;b.textContent='Pobieram…';status.classList.add('hidden');try{const data=await api('/api/gus',{method:'POST',body:JSON.stringify({[kind]:val})});if(data.name)form.name.value=data.name;if(data.nip)form.nip.value=data.nip;if(data.krs)form.krs.value=data.krs;status.textContent='Dane pobrane z rejestru publicznego'+(data.regon?' • REGON '+data.regon:'');status.className='gus-status success'}catch(e){status.textContent=e.message;status.className='gus-status error'}finally{b.disabled=false;b.textContent='Pobierz dane'}});
 form.onsubmit=async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(form)),err=$('#clientFormError');err.classList.add('hidden');try{const payload={id:fd.id?Number(fd.id):undefined,name:fd.name,contact_name:fd.contact_name,entity_type:fd.entity_type,nip:fd.nip,pesel:fd.entity_type==='jdg'?fd.pesel:'',krs:fd.entity_type==='jdg'?'':fd.krs};if(fd.id)await api('/api/clients',{method:'PATCH',body:JSON.stringify(payload)});else await api('/api/clients',{method:'POST',body:JSON.stringify(payload)});panel.classList.add('hidden');await clientsView()}catch(x){err.textContent=x.message;err.classList.remove('hidden')}};
 setEntity('jdg');draw();
}

async function pipeline(){
 await loadLeads();app.innerHTML=`<div class="board-tools"><input id="boardSearch" placeholder="Szukaj szansy..."><select id="boardSource"><option value="">Wszystkie źródła</option>${[...new Set(leads.map(l=>l.source))].map(s=>`<option>${s}</option>`).join('')}</select><select id="boardGrade"><option value="">Każdy segment</option><option>A</option><option>B</option><option>C</option></select></div><div id="pipelineBoard" class="pipeline"></div>`;
 const draw=()=>{const q=$('#boardSearch').value.toLowerCase(),src=$('#boardSource').value,gr=$('#boardGrade').value,base=currentUser.role==='employee'?leads.filter(l=>l.owner===currentEmployeeName()):leads,filtered=base.filter(l=>(!src||l.source===src)&&(!gr||l.grade===gr)&&(`${l.company} ${l.contact} ${l.owner}`.toLowerCase().includes(q)));$('#pipelineBoard').innerHTML=stages.map(s=>{const ls=filtered.filter(l=>l.stage===s),total=ls.reduce((a,l)=>a+Number(l.mrr||0),0);return `<div class="column"><div class="column-head"><div>${s}<span class="column-total">${money(total)} MRR</span></div><span class="count">${ls.length}</span></div><div class="column-body">${ls.map(card).join('')||'<div class="empty">Brak szans</div>'}</div></div>`}).join('');document.querySelectorAll('.lead-card').forEach(el=>el.onclick=()=>advance(Number(el.dataset.id)))};
 ['#boardSearch','#boardSource','#boardGrade'].forEach(sel=>$(sel).addEventListener('input',draw));draw();
}
function card(l){return `<div class="lead-card" data-id="${l.id}"><span class="more">⋮</span><h4>${l.company}</h4><p>${l.contact} • ${l.owner||'Nieprzypisany'}</p><div class="lead-price">${money(l.mrr)}</div><div class="lead-meta"><span>${l.followup||'brak terminu'} ${overdue(l.followup)?'<span class="overdue-badge">po terminie</span>':''}</span><span class="grade-dot grade-${l.grade.toLowerCase()}">${l.grade}</span></div></div>`}
async function advance(id){const l=leads.find(x=>x.id===id),i=stages.indexOf(l.stage);if(!l||i>=stages.length-1)return;await api('/api/leads',{method:'PATCH',body:JSON.stringify({id,stage:stages[i+1]})});await render()}

async function leadTable(){
 await loadLeads();app.innerHTML=`<div class="toolbar"><input id="q" placeholder="Szukaj firmy, kontaktu lub opiekuna…"><select id="stageFilter"><option value="">Wszystkie etapy</option>${stages.map(s=>`<option>${s}</option>`).join('')}</select></div><div class="table-wrap"><table><thead><tr><th>Firma</th><th>Kontakt</th><th>Opiekun</th><th>Źródło</th><th>Etap</th><th>Segment</th><th>MRR</th><th>Follow-up</th></tr></thead><tbody id="rows"></tbody></table></div>`;
 const draw=()=>{let q=$('#q').value.toLowerCase(),sf=$('#stageFilter').value,base=currentUser.role==='employee'?leads.filter(l=>l.owner===currentEmployeeName()):leads;$('#rows').innerHTML=base.filter(l=>(!sf||l.stage===sf)&&(`${l.company} ${l.contact} ${l.owner} ${l.email}`.toLowerCase().includes(q))).map(l=>`<tr><td><b>${l.company}</b><br><small>${l.note||''}</small></td><td>${l.contact}<br><small>${l.email||''}</small></td><td>${l.owner||'Nieprzypisany'}</td><td>${l.source}</td><td>${l.stage}</td><td><span class="chip ${l.grade.toLowerCase()}">${l.grade}</span></td><td>${money(l.mrr)}</td><td class="${overdue(l.followup)?'overdue':'ok'}">${l.followup||'—'}</td></tr>`).join('')||'<tr><td colspan="8">Brak leadów.</td></tr>'};
 const q=$('#q');q.oninput=draw;$('#stageFilter').onchange=draw;if(pendingOwnerFilter){q.value=pendingOwnerFilter;pendingOwnerFilter=null}draw();
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
 base.forEach(l=>{if(l.followup&&l.followup<today&&!['Wygrany','Przegrany'].includes(l.stage))items.push({type:'overdue',id:l.id,title:'Zaległy follow-up',detail:l.company,date:l.followup,view:'leads',priority:3});if(l.followup===today&&!['Wygrany','Przegrany'].includes(l.stage))items.push({type:'today',id:l.id,title:'Follow-up na dziś',detail:l.company,date:l.followup,view:'leads',priority:2});if((!l.owner||l.owner==='Nieprzypisany')&&currentUser.role!=='employee'&&!['Wygrany','Przegrany'].includes(l.stage))items.push({type:'owner',id:l.id,title:'Lead bez opiekuna',detail:l.company,date:l.created_at,view:'leads',priority:2})});
 reminders.slice(0,10).forEach(r=>items.push({type:'reminder',id:r.id,title:r.title||'Przypomnienie',detail:r.detail||'',date:r.created_at,view:'reminders',priority:1}));
 return items.sort((a,b)=>b.priority-a.priority).slice(0,20);
}
async function refreshNotifications(){
 if(!currentUser)return;
 try{const items=await buildNotifications(),read=readNotifications(),unread=items.filter(n=>!read.has(notificationKey(n))).length;notificationBadge.textContent=unread>99?'99+':String(unread);notificationBadge.classList.toggle('hidden-badge',unread===0);notificationSummary.textContent=unread===1?'1 nowe':unread+' nowych';notificationList.innerHTML=items.length?items.map(n=>{const key=notificationKey(n),isRead=read.has(key);return `<button class="notification-item ${isRead?'is-read':''}" data-notification-key="${encodeURIComponent(key)}" data-notification-view="${n.view}"><span class="notification-icon">!</span><span class="notification-copy"><b>${n.title}</b><small>${n.detail}</small></span><span class="notification-time">${n.date?datePL(n.date):''}</span></button>`}).join(''):'<div class="notification-empty">Wszystko ogarnięte 🎉<small>Nie masz teraz żadnych alertów.</small></div>';notificationList.querySelectorAll('.notification-item').forEach(el=>el.onclick=()=>{const set=readNotifications();set.add(decodeURIComponent(el.dataset.notificationKey));saveReadNotifications(set);notificationPanel.classList.add('hidden');view=el.dataset.notificationView||'dashboard';render();refreshNotifications()})}catch(e){notificationBadge.textContent='!'}
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

document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{view=b.dataset.view;render()});
const modal=$('#modal');addLeadBtn.onclick=()=>modal.classList.remove('hidden');$('#closeModal').onclick=()=>modal.classList.add('hidden');
$('#leadForm').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));if(currentUser.role==='employee')d.owner=currentEmployeeName();try{await api('/api/leads',{method:'POST',body:JSON.stringify({...d,mrr:Number(d.mrr)||0,stage:'Nowy lead'})});e.target.reset();modal.classList.add('hidden');await api('/api/modules',{method:'POST',body:JSON.stringify({module:'history',title:'Dodano lead',detail:d.company})}).catch(()=>{});await render();await refreshNotifications()}catch(err){alert(err.message)}};
$('#globalSearch').oninput=async e=>{const q=e.target.value.trim();if(q.length<2)return;try{await loadLeads();const base=currentUser.role==='employee'?leads.filter(l=>l.owner===currentEmployeeName()):leads;if(base.some(l=>(l.company+' '+l.contact+' '+l.email+' '+l.owner).toLowerCase().includes(q.toLowerCase()))){view='leads';await render();const inp=$('#q');if(inp){inp.value=q;inp.dispatchEvent(new Event('input'))}}}catch{}};

bootAuth();