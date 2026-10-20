import { db, ensureSchema } from '../lib/db.js';
import { requireUser } from '../lib/auth.js';

const defaults=[
  'Pierwszy kontakt z leadem',
  'Rozmowa / kwalifikacja potrzeb',
  'Przygotowanie i wysłanie oferty',
  'Ustalenie warunków współpracy',
  'Zebranie danych do umowy',
  'Podpisana umowa',
  'Wysłano maila z kontaktem do opiekuna',
  'Dodanie kanału na Slacku',
  'Ustalenie sposobu wymiany dokumentów',
  'Zestawienie klientów',
  'Rejestracja działalności',
  'Weryfikacja na wniosku do CEIDG formy opodatkowania',
  'Dodanie rachunku bankowego do CEIDG',
  'Dopisanie do checklisty ZUS rejestracji',
  'Ustalenie sposobu opłacania ZUS',
  'Złożenie VAT-R',
  'Weryfikacja GTU i ew. stawki ryczałtu',
  'Weryfikacja białej listy',
  'Przekazanie instrukcji do złożenia pełnomocnictw',
  'Pełnomocnictwa złożone',
  'Pełnomocnictwa potwierdzone',
  'Dopytanie o koszty samochodu, mieszkania i opisanie',
  'Dostępy i dokumenty do księgowości',
  'Połączenie KSeF',
  'Dodanie do fakturowni konta klienta i faktury cyklicznej',
  'Dodanie do Mailchimpa',
  'Start obsługi klienta',
  'Zakończenie onboardingu - potwierdzenie wszystkiego powyżej'
];

async function assertLeadAccess(sql,user,leadId){
  const rows=user.role==='employee'
    ? await sql`SELECT id FROM leads WHERE id=${leadId} AND owner=${user.full_name} LIMIT 1`
    : await sql`SELECT id FROM leads WHERE id=${leadId} LIMIT 1`;
  return Boolean(rows[0]);
}

export default async function handler(req,res){
  try{
    await ensureSchema();
    const user=await requireUser(req,res);
    if(!user)return;
    const sql=db();

    const leadId=Number(req.method==='GET'?req.query.lead_id:(req.body?.lead_id||req.query.lead_id));
    if(!leadId)return res.status(400).json({error:'Brak lead_id.'});
    if(!(await assertLeadAccess(sql,user,leadId)))return res.status(403).json({error:'Brak dostępu do tego leada.'});

    if(req.method==='GET'){
      await sql`
        UPDATE lead_onboarding_items
        SET title='Zebranie danych do umowy',updated_at=NOW()
        WHERE lead_id=${leadId} AND title='Dane do umowy'
      `;
      await sql`
        UPDATE lead_onboarding_items
        SET title='Podpisana umowa',updated_at=NOW()
        WHERE lead_id=${leadId} AND title='Umowa podpisana'
      `;
      await sql`
        UPDATE lead_onboarding_items
        SET title='Wysłano maila z kontaktem do opiekuna',updated_at=NOW()
        WHERE lead_id=${leadId} AND title='Wysłano maila z kontaktem do opiekuna'
      `;

      const existingItems=await sql`
        SELECT id,title FROM lead_onboarding_items WHERE lead_id=${leadId}
      `;
      const existingTitles=new Set(existingItems.map(x=>x.title));
      let addedDefaults=0;
      for(let i=0;i<defaults.length;i++){
        if(existingTitles.has(defaults[i])) continue;
        await sql`
          INSERT INTO lead_onboarding_items(lead_id,title,sort_order)
          VALUES(${leadId},${defaults[i]},${i+1})
        `;
        addedDefaults++;
      }
      for(let i=0;i<defaults.length;i++){
        await sql`
          UPDATE lead_onboarding_items
          SET sort_order=${i+1},updated_at=NOW()
          WHERE lead_id=${leadId} AND title=${defaults[i]}
        `;
      }
      await sql`
        UPDATE lead_onboarding_items
        SET sort_order=1000+id
        WHERE lead_id=${leadId}
          AND title <> ALL(${defaults})
      `;

      if(addedDefaults){
        await sql`
          INSERT INTO lead_events(lead_id,event_type,title,detail,actor_id,actor_name)
          VALUES(
            ${leadId},
            'onboarding',
            ${existingItems.length?'Uzupełniono checklistę onboardingu':'Utworzono checklistę onboardingu'},
            ${existingItems.length?'Dodano brakujące punkty i uporządkowano proces.':'Domyślna checklista została dodana.'},
            ${Number(user.id)},
            ${user.full_name}
          )
        `;
      }
      const items=await sql`
        SELECT id,lead_id,title,assignee_user_id,assignee_name,is_done,completed_at,sort_order,created_at,updated_at
        FROM lead_onboarding_items WHERE lead_id=${leadId}
        ORDER BY sort_order,id
      `;
      const events=await sql`
        SELECT id,lead_id,event_type,title,detail,actor_name,occurred_at
        FROM lead_events WHERE lead_id=${leadId}
        ORDER BY occurred_at DESC,id DESC
      `;
      return res.status(200).json({items,events});
    }

    if(req.method==='POST'){
      const action=String(req.body?.action||'add_item');
      if(action==='add_item'){
        const title=String(req.body?.title||'').trim();
        if(!title)return res.status(400).json({error:'Wpisz nazwę punktu.'});
        const max=(await sql`SELECT COALESCE(MAX(sort_order),0)::int AS n FROM lead_onboarding_items WHERE lead_id=${leadId}`)[0]?.n||0;
        const rows=await sql`
          INSERT INTO lead_onboarding_items(lead_id,title,sort_order)
          VALUES(${leadId},${title},${Number(max)+1})
          RETURNING id,lead_id,title,assignee_user_id,assignee_name,is_done,completed_at,sort_order,created_at,updated_at
        `;
        await sql`
          INSERT INTO lead_events(lead_id,event_type,title,detail,actor_id,actor_name)
          VALUES(${leadId},'checklist','Dodano punkt onboardingu',${title},${Number(user.id)},${user.full_name})
        `;
        return res.status(201).json(rows[0]);
      }
      if(action==='add_event'){
        const title=String(req.body?.title||'').trim();
        const detail=String(req.body?.detail||'').trim();
        if(!title)return res.status(400).json({error:'Wpisz tytuł zdarzenia.'});
        const rows=await sql`
          INSERT INTO lead_events(lead_id,event_type,title,detail,actor_id,actor_name)
          VALUES(${leadId},'note',${title},${detail},${Number(user.id)},${user.full_name})
          RETURNING id,lead_id,event_type,title,detail,actor_name,occurred_at
        `;
        return res.status(201).json(rows[0]);
      }
      return res.status(400).json({error:'Nieznana akcja.'});
    }

    if(req.method==='PATCH'){
      const itemId=Number(req.body?.id);
      if(!itemId)return res.status(400).json({error:'Brak id punktu.'});
      const current=(await sql`
        SELECT id,title,is_done,assignee_user_id,assignee_name
        FROM lead_onboarding_items WHERE id=${itemId} AND lead_id=${leadId} LIMIT 1
      `)[0];
      if(!current)return res.status(404).json({error:'Nie znaleziono punktu.'});

      const done=req.body?.is_done===undefined?current.is_done:Boolean(req.body.is_done);
      let assigneeId=current.assignee_user_id;
      let assigneeName=current.assignee_name||'';
      if(req.body?.assignee_user_id!==undefined){
        assigneeId=req.body.assignee_user_id?Number(req.body.assignee_user_id):null;
        assigneeName='';
        if(assigneeId){
          const u=(await sql`SELECT id,full_name FROM app_users WHERE id=${assigneeId} AND is_active=TRUE LIMIT 1`)[0];
          if(!u)return res.status(400).json({error:'Nie znaleziono aktywnego użytkownika.'});
          assigneeName=u.full_name;
        }
      }
      const rows=await sql`
        UPDATE lead_onboarding_items SET
          assignee_user_id=${assigneeId},
          assignee_name=${assigneeName},
          is_done=${done},
          completed_at=CASE WHEN ${done}=TRUE AND is_done=FALSE THEN NOW() WHEN ${done}=FALSE THEN NULL ELSE completed_at END,
          updated_at=NOW()
        WHERE id=${itemId} AND lead_id=${leadId}
        RETURNING id,lead_id,title,assignee_user_id,assignee_name,is_done,completed_at,sort_order,created_at,updated_at
      `;

      if(done!==current.is_done){
        await sql`
          INSERT INTO lead_events(lead_id,event_type,title,detail,actor_id,actor_name)
          VALUES(
            ${leadId},
            'checklist',
            ${done?'Zakończono punkt onboardingu':'Cofnięto punkt onboardingu'},
            ${current.title},
            ${Number(user.id)},
            ${user.full_name}
          )
        `;
      }else if(String(assigneeName)!==String(current.assignee_name||'')){
        await sql`
          INSERT INTO lead_events(lead_id,event_type,title,detail,actor_id,actor_name)
          VALUES(${leadId},'assignment','Przypisano odpowiedzialność',${current.title+' → '+(assigneeName||'Nieprzypisany')},${Number(user.id)},${user.full_name})
        `;
      }
      return res.status(200).json(rows[0]);
    }

    if(req.method==='DELETE'){
      const itemId=Number(req.query.id);
      if(!itemId)return res.status(400).json({error:'Brak id punktu.'});
      const current=(await sql`SELECT id,title FROM lead_onboarding_items WHERE id=${itemId} AND lead_id=${leadId} LIMIT 1`)[0];
      if(!current)return res.status(404).json({error:'Nie znaleziono punktu.'});
      await sql`DELETE FROM lead_onboarding_items WHERE id=${itemId}`;
      await sql`
        INSERT INTO lead_events(lead_id,event_type,title,detail,actor_id,actor_name)
        VALUES(${leadId},'checklist','Usunięto punkt onboardingu',${current.title},${Number(user.id)},${user.full_name})
      `;
      return res.status(204).end();
    }

    return res.status(405).json({error:'Method not allowed'});
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e.message||'Błąd serwera'});
  }
}
