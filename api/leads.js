import { db, ensureSchema } from '../lib/db.js';
import { requireUser } from '../lib/auth.js';
import { apiRateLimit } from '../lib/rate-limit.js';
import { addHistory } from '../lib/history.js';

export default async function handler(req,res){
  try{
    if(!apiRateLimit(req,res)) return;
    await ensureSchema();
    const user=await requireUser(req,res);
    if(!user)return;
    const sql=db();
    const ownOnly=user.role==='employee';

    if(req.method==='GET'){
      const rows=ownOnly
        ? await sql`SELECT id,company,contact,email,phone,source,mrr::float8 AS mrr,grade,lead_quality,stage,followup::text AS followup,note,owner,lead_result,result_note,closed_at,created_at,updated_at FROM leads WHERE owner=${user.full_name} ORDER BY created_at DESC`
        : await sql`SELECT id,company,contact,email,phone,source,mrr::float8 AS mrr,grade,lead_quality,stage,followup::text AS followup,note,owner,lead_result,result_note,closed_at,created_at,updated_at FROM leads ORDER BY created_at DESC`;
      return res.status(200).json(rows);
    }

    if(req.method==='POST'){
      const b=req.body||{};
      if(!b.company)return res.status(400).json({error:'Nazwa leada jest wymagana.'});
      let owner=String(b.owner||'Nieprzypisany');
      if(owner!=='Nieprzypisany'){
        const ownerUser=(await sql`SELECT full_name FROM app_users WHERE full_name=${owner} AND is_active=TRUE LIMIT 1`)[0];
        if(!ownerUser)return res.status(400).json({error:'Wybrany opiekun nie jest aktywnym użytkownikiem.'});
        owner=ownerUser.full_name;
      }
      const rows=await sql`
        INSERT INTO leads(company,contact,email,phone,source,mrr,grade,lead_quality,stage,followup,note,owner)
        VALUES(${b.company},${b.contact||''},${b.email||''},${b.phone||''},${b.source||'Inne'},${Number(b.mrr)||0},${b.grade||'B'},${b.lead_quality||'Dobry'},${b.stage||'Nowy lead'},${b.followup||null},${b.note||''},${owner})
        RETURNING id,company,contact,email,phone,source,mrr::float8 AS mrr,grade,lead_quality,stage,followup::text AS followup,note,owner,lead_result,result_note,closed_at,created_at,updated_at`;
      await sql`
        INSERT INTO lead_events(lead_id,event_type,title,detail,actor_id,actor_name)
        VALUES(${rows[0].id},'created','Utworzono lead',${rows[0].company},${Number(user.id)},${user.full_name})
      `;
      await addHistory(sql,{title:'Dodano lead',detail:rows[0].company,actor:user.full_name,status:'lead_created'});
      return res.status(201).json(rows[0]);
    }

    if(req.method==='PATCH'){
      const b=req.body||{},id=Number(b.id);
      if(!id)return res.status(400).json({error:'Brak id.'});
      const current=(ownOnly
        ? await sql`SELECT * FROM leads WHERE id=${id} AND owner=${user.full_name} LIMIT 1`
        : await sql`SELECT * FROM leads WHERE id=${id} LIMIT 1`)[0];
      if(!current)return res.status(ownOnly?403:404).json({error:ownOnly?'Brak dostępu do tego leada.':'Nie znaleziono leada.'});

      let owner=b.owner??null;
      if(owner!==null){
        owner=String(owner||'Nieprzypisany');
        if(owner!=='Nieprzypisany'){
          const ownerUser=(await sql`SELECT full_name FROM app_users WHERE full_name=${owner} AND is_active=TRUE LIMIT 1`)[0];
          if(!ownerUser)return res.status(400).json({error:'Wybrany opiekun nie jest aktywnym użytkownikiem.'});
          owner=ownerUser.full_name;
        }
      }
      const requestedResult=b.lead_result===undefined?current.lead_result:String(b.lead_result);
      const leadResult=['in_progress','won','rejected'].includes(requestedResult)?requestedResult:current.lead_result;
      const requestedStage=b.stage??null;
      const nextStage=leadResult==='won'?'Wygrany':leadResult==='rejected'?'Przegrany':requestedStage;
      const resultNote=b.result_note===undefined?current.result_note:String(b.result_note||'');

      const rows=await sql`
        UPDATE leads SET
          company=COALESCE(${b.company??null},company),
          contact=COALESCE(${b.contact??null},contact),
          email=COALESCE(${b.email??null},email),
          phone=COALESCE(${b.phone??null},phone),
          source=COALESCE(${b.source??null},source),
          mrr=COALESCE(${b.mrr!==undefined?Number(b.mrr):null},mrr),
          grade=COALESCE(${b.grade??null},grade),
          lead_quality=COALESCE(${b.lead_quality??null},lead_quality),
          stage=COALESCE(${nextStage},stage),
          followup=CASE WHEN ${b.followup===''} THEN NULL ELSE COALESCE(${b.followup??null}::date,followup) END,
          note=COALESCE(${b.note??null},note),
          owner=COALESCE(${owner},owner),
          lead_result=${leadResult},
          result_note=${resultNote},
          closed_at=CASE
            WHEN ${leadResult}='in_progress' THEN NULL
            WHEN lead_result<>${leadResult} OR closed_at IS NULL THEN NOW()
            ELSE closed_at
          END,
          updated_at=NOW()
        WHERE id=${id}
        RETURNING id,company,contact,email,phone,source,mrr::float8 AS mrr,grade,lead_quality,stage,followup::text AS followup,note,owner,lead_result,result_note,closed_at,created_at,updated_at`;
      if(!rows[0])return res.status(404).json({error:'Nie znaleziono leada.'});

      if(rows[0].stage!==current.stage){
        await sql`
          INSERT INTO lead_events(lead_id,event_type,title,detail,actor_id,actor_name)
          VALUES(${id},'stage','Zmiana etapu',${current.stage+' → '+rows[0].stage},${Number(user.id)},${user.full_name})
        `;
        await addHistory(sql,{title:'Zmieniono etap leada',detail:rows[0].company+' • '+current.stage+' → '+rows[0].stage,actor:user.full_name,status:'lead_stage'});
      }
      if(rows[0].lead_result!==current.lead_result){
        const resultTitle=rows[0].lead_result==='won'?'Onboarding zakończony sukcesem':rows[0].lead_result==='rejected'?'Lead odrzucony':'Lead przywrócony do procesu';
        await sql`
          INSERT INTO lead_events(lead_id,event_type,title,detail,actor_id,actor_name)
          VALUES(${id},'result',${resultTitle},${resultNote},${Number(user.id)},${user.full_name})
        `;
        await addHistory(sql,{title:resultTitle,detail:rows[0].company+(resultNote?' • '+resultNote:''),actor:user.full_name,status:'lead_result'});

        if(rows[0].lead_result==='won'){
          let client=(await sql`
            SELECT id FROM clients WHERE source_lead_id=${id} LIMIT 1
          `)[0];

          if(!client){
            const created=await sql`
              INSERT INTO clients(
                name,contact_name,entity_type,nip,contact_email,cooperation_start_date,
                client_status,source_lead_id,profile_complete
              )
              VALUES(
                ${rows[0].company},
                ${rows[0].contact||null},
                NULL,
                NULL,
                ${rows[0].email||''},
                CURRENT_DATE,
                'active',
                ${id},
                FALSE
              )
              RETURNING id
            `;
            client=created[0];
            await sql`
              INSERT INTO client_status_events(client_id,from_status,to_status,actor_id,actor_name)
              VALUES(${client.id},NULL,'active',${Number(user.id)},${user.full_name})
            `;
            await addHistory(sql,{title:'Lead został klientem',detail:rows[0].company,actor:user.full_name,status:'lead_to_client'});
          }
        }
      }
      if((b.owner??null)!==null && String(rows[0].owner)!==String(current.owner)){
        await sql`
          INSERT INTO lead_events(lead_id,event_type,title,detail,actor_id,actor_name)
          VALUES(${id},'assignment','Zmieniono opiekuna leada',${String(rows[0].owner)},${Number(user.id)},${user.full_name})
        `;
        await addHistory(sql,{title:'Zmieniono opiekuna leada',detail:rows[0].company+' • '+String(current.owner||'Nieprzypisany')+' → '+String(rows[0].owner||'Nieprzypisany'),actor:user.full_name,status:'lead_owner'});
      }
      const baseFields=['company','contact','email','phone','source','mrr','grade','lead_quality','note','followup'];
      const edited=baseFields.some(k=>b[k]!==undefined && String(rows[0][k]??'')!==String(current[k]??''));
      if(edited)await addHistory(sql,{title:'Edytowano lead',detail:rows[0].company,actor:user.full_name,status:'lead_updated'});
      return res.status(200).json(rows[0]);
    }

    if(req.method==='DELETE'){
      if(ownOnly)return res.status(403).json({error:'Pracownik nie może usuwać leadów.'});
      const id=Number(req.query.id);if(!id)return res.status(400).json({error:'Brak id.'});
      const current=(await sql`SELECT company FROM leads WHERE id=${id} LIMIT 1`)[0];
      if(!current)return res.status(404).json({error:'Nie znaleziono leada.'});
      await sql`DELETE FROM leads WHERE id=${id}`;
      await addHistory(sql,{title:'Usunięto lead',detail:current.company,actor:user.full_name,status:'lead_deleted'});
      return res.status(204).end();
    }

    return res.status(405).json({error:'Method not allowed'});
  }catch(e){console.error(e);return res.status(500).json({error:e.message||'Błąd serwera'})}
}
