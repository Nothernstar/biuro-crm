function settingJson(rows,key,fallback){
  const row=rows.find(r=>r.title===key);
  if(!row||!row.detail)return fallback;
  try{return Object.assign({},fallback,JSON.parse(row.detail))}catch{return fallback}
}
function settingsListText(v){return Array.isArray(v)?v.join('\n'):''}
function settingsListValue(v){return String(v||'').split(/\n|,/).map(x=>x.trim()).filter(Boolean)}
function settingsEsc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

async function settingsView(){
  if(!['admin','manager'].includes(currentUser&&currentUser.role)){
    view='dashboard';localStorage.setItem('brcrm_view',view);return render();
  }
  const data=await Promise.all([
    api('/api/modules?module=settings'),
    api('/api/team').catch(()=>[])
  ]);
  const rows=data[0],team=data[1],isAdmin=currentUser.role==='admin';
  const organization=settingJson(rows,'organization',{name:'Piasecki Gągała — Biuro Rachunkowe',email:'',phone:'',address:'',signature:'Pozdrawiamy,\nPiasecki Gągała — Biuro Rachunkowe'});
  const security=settingJson(rows,'security',{idle_minutes:60,force_password_change:true,login_protection:true});
  const dictionaries=settingJson(rows,'crm_dictionaries',{
    lead_sources:['Google Ads','SEO','Polecenie','Partner','Social media','Formularz WWW','Telefon','Inne'],
    lead_qualities:['Dobry','Słaby'],
    lead_stages:['Nowy lead','Do kontaktu','Kontakt wykonany','Kwalifikacja','Oferta','Follow-up','Wygrany','Przegrany'],
    client_statuses:['Aktywny','Zawieszony','Nieobsługiwany','Wstrzymany przez płatności'],
    entity_types:['JDG','Spółka','Fundacja'],languages:['Polski'],settlement_frequencies:['miesięcznie','kwartalnie'],
    taxation_forms:['Skala podatkowa','Podatek liniowy','Ryczałt','CIT'],vat_options:['VAT czynny','Zwolniony z VAT'],
    zus_options:['Pełny ZUS','Preferencyjny ZUS','Ulga na start','Bez ZUS']
  });
  const onboarding=settingJson(rows,'onboarding',{
    acquisition:['Pierwszy kontakt','Rozmowa kwalifikacyjna','Przygotowanie i wysłanie oferty','Ustalenie warunków współpracy'],
    onboarding:['Umowa i dokumenty','Pełnomocnictwa','KSeF','CEIDG / ZUS / VAT-R','Przekazanie dokumentacji','Potwierdzenie zakończenia onboardingu']
  });
  const reminders=settingJson(rows,'reminders',{default_followup_days:3,overdue_alerts:true,visibility:'owner'});
  const templates=settingJson(rows,'templates_defaults',{contact:'',reminder:'',onboarding:''});
  const badge=ok=>ok?'<span class="settings-access editable">Można edytować</span>':'<span class="settings-access locked">Tylko administrator</span>';

  app.innerHTML=
    '<div class="settings-intro"><div><h2>Centrum konfiguracji CRM</h2><p>Zarządzaj zasadami pracy, słownikami i ustawieniami całego biura w jednym miejscu.</p></div><span class="settings-role-badge">'+roleLabel(currentUser.role)+'</span></div>'+
    '<div class="settings-grid">'+
      settingCard('⌂','Dane organizacji',badge(isAdmin),'Nazwa biura, kontakt, adres i domyślna stopka korespondencji.',settingsEsc(organization.name),organization.email||'Brak firmowego e-maila','organization',isAdmin?'Edytuj':'Brak dostępu',!isAdmin)+
      settingCard('◇','Bezpieczeństwo',badge(isAdmin),'Polityka haseł, bezczynności i ochrony logowania.',security.idle_minutes+' min bezczynności',security.force_password_change?'Wymagana zmiana hasła tymczasowego':'Bez wymuszania zmiany hasła','security',isAdmin?'Skonfiguruj':'Brak dostępu',!isAdmin)+
      settingCard('♙','Użytkownicy i role',badge(isAdmin),'Konta administratorów, managerów i pracowników oraz dostęp do CRM.',team.length+' aktywnych użytkowników','Administrator • Manager • Pracownik','users',isAdmin?'Przejdź do użytkowników':'Tylko administrator',!isAdmin,true)+
      settingCard('▤','Słowniki CRM',badge(true),'Źródła, etapy i oceny leadów oraz statusy i parametry klientów.',dictionaries.lead_sources.length+' źródeł • '+dictionaries.lead_stages.length+' etapów',dictionaries.entity_types.join(' • '),'crm_dictionaries','Edytuj słowniki',false)+
      settingCard('✓','Proces leadów i onboarding',badge(true),'Checklisty przed pozyskaniem klienta i po rozpoczęciu współpracy.',onboarding.acquisition.length+' kroków pozyskania',onboarding.onboarding.length+' kroków onboardingu','onboarding','Skonfiguruj proces',false)+
      settingCard('◫','Przypomnienia i powiadomienia',badge(true),'Domyślny follow-up, alerty o zaległościach i widoczność przypomnień.','Follow-up: '+reminders.default_followup_days+' dni',reminders.overdue_alerts?'Alerty zaległych włączone':'Alerty zaległych wyłączone','reminders','Edytuj zasady',false)+
      settingCard('✉','Szablony e-mail',badge(true),'Domyślne treści kontaktu, przypomnienia i rozpoczęcia współpracy.','3 typy wiadomości','Pełna biblioteka jest w sekcji „Szablony e-mail”','templates_defaults','Domyślne treści',false)+
      '<section class="settings-card settings-card-system"><div class="settings-card-icon">ⓘ</div><div class="settings-card-body"><div class="settings-card-title"><h3>Informacje systemowe</h3><span class="settings-access neutral">Hobby friendly</span></div><p>Konfiguracja korzysta z istniejącego API i nie dodaje kolejnej funkcji serverless.</p><div class="settings-preview"><b>BRCRM • Piasecki Gągała</b><span>Ustawienia są zapisywane centralnie dla całego CRM.</span></div></div></section>'+
    '</div><div id="settingsEditor" class="settings-editor hidden"></div>';

  function settingCard(icon,title,badgeHtml,desc,strong,sub,key,button,disabled,link){
    return '<section class="settings-card"><div class="settings-card-icon">'+icon+'</div><div class="settings-card-body"><div class="settings-card-title"><h3>'+title+'</h3>'+badgeHtml+'</div><p>'+desc+'</p><div class="settings-preview"><b>'+strong+'</b><span>'+sub+'</span></div></div><button class="settings-action" '+(link?'data-settings-link':'data-settings-edit')+'="'+key+'" '+(disabled?'disabled':'')+'>'+button+'</button></section>';
  }

  const editor=document.querySelector('#settingsEditor');
  async function saveSetting(key,label,value){
    await api('/api/modules?module=settings',{method:'PATCH',body:JSON.stringify({module:'settings',title:key,status:label,detail:JSON.stringify(value)})});
    await settingsView();
  }
  function openEditor(key){
    let title='',body='';
    if(key==='organization'){
      title='Dane organizacji';
      body='<div class="settings-form-grid"><label>Nazwa biura<input name="name" value="'+settingsEsc(organization.name)+'"></label><label>E-mail firmowy<input name="email" type="email" value="'+settingsEsc(organization.email)+'"></label><label>Telefon<input name="phone" value="'+settingsEsc(organization.phone)+'"></label><label>Adres<input name="address" value="'+settingsEsc(organization.address)+'"></label><label class="settings-span-2">Domyślna stopka<textarea name="signature" rows="4">'+settingsEsc(organization.signature)+'</textarea></label></div>';
    }else if(key==='security'){
      title='Bezpieczeństwo';
      body='<div class="settings-form-grid"><label>Czas bezczynności (min)<input name="idle_minutes" type="number" min="5" max="720" value="'+security.idle_minutes+'"></label><label class="settings-check"><input name="force_password_change" type="checkbox" '+(security.force_password_change?'checked':'')+'> Wymuszaj zmianę hasła tymczasowego</label><label class="settings-check"><input name="login_protection" type="checkbox" '+(security.login_protection?'checked':'')+'> Ochrona logowania / limit prób</label><p class="settings-form-note settings-span-2">Limit prób logowania działa już po stronie API. Czas bezczynności jest zapisywany jako polityka systemowa.</p></div>';
    }else if(key==='crm_dictionaries'){
      title='Słowniki CRM';
      body='<div class="settings-form-grid">'+
        area('Źródła leadów','lead_sources',dictionaries.lead_sources,5)+area('Oceny leadów','lead_qualities',dictionaries.lead_qualities,5)+
        area('Etapy leadów','lead_stages',dictionaries.lead_stages,6)+area('Statusy klientów','client_statuses',dictionaries.client_statuses,6)+
        area('Formy prawne','entity_types',dictionaries.entity_types,4)+area('Języki obsługi','languages',dictionaries.languages,4)+
        area('Cykle rozliczeń','settlement_frequencies',dictionaries.settlement_frequencies,4)+area('Formy opodatkowania','taxation_forms',dictionaries.taxation_forms,4)+
        area('Opcje VAT','vat_options',dictionaries.vat_options,4)+area('Opcje ZUS','zus_options',dictionaries.zus_options,4)+'</div>';
    }else if(key==='onboarding'){
      title='Proces leadów i onboarding';
      body='<div class="settings-form-grid">'+area('Czynności wstępne pozyskania','acquisition',onboarding.acquisition,8)+area('Czynności onboardingowe','onboarding',onboarding.onboarding,8)+'</div>';
    }else if(key==='reminders'){
      title='Przypomnienia i powiadomienia';
      body='<div class="settings-form-grid"><label>Domyślny follow-up po ilu dniach<input name="default_followup_days" type="number" min="0" max="90" value="'+reminders.default_followup_days+'"></label><label>Widoczność<select name="visibility"><option value="owner" '+(reminders.visibility==='owner'?'selected':'')+'>Tylko opiekun</option><option value="team" '+(reminders.visibility==='team'?'selected':'')+'>Cały zespół</option></select></label><label class="settings-check settings-span-2"><input name="overdue_alerts" type="checkbox" '+(reminders.overdue_alerts?'checked':'')+'> Pokazuj alerty o zaległych follow-upach</label></div>';
    }else if(key==='templates_defaults'){
      title='Domyślne treści e-mail';
      body='<div class="settings-form-grid one"><label>Kontakt z potencjalnym klientem<textarea name="contact" rows="5">'+settingsEsc(templates.contact)+'</textarea></label><label>Przypomnienie<textarea name="reminder" rows="5">'+settingsEsc(templates.reminder)+'</textarea></label><label>Rozpoczęcie współpracy<textarea name="onboarding" rows="5">'+settingsEsc(templates.onboarding)+'</textarea></label></div>';
    }
    editor.innerHTML='<div class="settings-editor-backdrop"><form class="settings-editor-card" id="settingsForm"><div class="modal-head"><div><h2>'+title+'</h2><p>Zmiany zapisują się dla całego CRM.</p></div><button type="button" id="closeSettingsEditor">×</button></div>'+body+'<div class="settings-editor-actions"><button type="button" class="secondary" id="cancelSettingsEditor">Anuluj</button><button class="primary">Zapisz zmiany</button></div></form></div>';
    editor.classList.remove('hidden');
    document.querySelector('#closeSettingsEditor').onclick=document.querySelector('#cancelSettingsEditor').onclick=()=>editor.classList.add('hidden');
    document.querySelector('#settingsForm').onsubmit=async e=>{
      e.preventDefault();
      const fd=new FormData(e.target),d=Object.fromEntries(fd),value={};
      if(key==='organization')Object.assign(value,{name:d.name.trim(),email:d.email.trim(),phone:d.phone.trim(),address:d.address.trim(),signature:d.signature});
      if(key==='security')Object.assign(value,{idle_minutes:Number(d.idle_minutes)||60,force_password_change:fd.has('force_password_change'),login_protection:fd.has('login_protection')});
      if(key==='crm_dictionaries')Object.assign(value,{lead_sources:settingsListValue(d.lead_sources),lead_qualities:settingsListValue(d.lead_qualities),lead_stages:settingsListValue(d.lead_stages),client_statuses:settingsListValue(d.client_statuses),entity_types:settingsListValue(d.entity_types),languages:settingsListValue(d.languages),settlement_frequencies:settingsListValue(d.settlement_frequencies),taxation_forms:settingsListValue(d.taxation_forms),vat_options:settingsListValue(d.vat_options),zus_options:settingsListValue(d.zus_options)});
      if(key==='onboarding')Object.assign(value,{acquisition:settingsListValue(d.acquisition),onboarding:settingsListValue(d.onboarding)});
      if(key==='reminders')Object.assign(value,{default_followup_days:Number(d.default_followup_days)||0,visibility:d.visibility,overdue_alerts:fd.has('overdue_alerts')});
      if(key==='templates_defaults')Object.assign(value,{contact:d.contact||'',reminder:d.reminder||'',onboarding:d.onboarding||''});
      await saveSetting(key,title,value);
    };
  }
  function area(label,name,value,rowsCount){return '<label>'+label+'<textarea name="'+name+'" rows="'+rowsCount+'">'+settingsEsc(settingsListText(value))+'</textarea></label>'}

  document.querySelectorAll('[data-settings-edit]').forEach(b=>b.onclick=()=>{if(!b.disabled)openEditor(b.dataset.settingsEdit)});
  document.querySelectorAll('[data-settings-link]').forEach(b=>b.onclick=()=>{if(b.disabled)return;view=b.dataset.settingsLink;localStorage.setItem('brcrm_view',view);render()});
}