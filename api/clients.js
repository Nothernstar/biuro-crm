import { db, ensureSchema } from '../lib/db.js';
import { requireUser } from '../lib/auth.js';
import { apiRateLimit } from '../lib/rate-limit.js';

const digits=value=>String(value||'').replace(/\D/g,'');

export default async function handler(req,res){
  try{
    if(!apiRateLimit(req,res)) return;
    await ensureSchema();
    const user=await requireUser(req,res);
    if(!user)return;
    const sql=db();

    if(req.method==='GET'){
      const rows=await sql`
        SELECT id,name,contact_name,first_name,last_name,entity_type,nip,pesel,krs,regon,residence_address,business_address,correspondence_address,taxation_form,vat_status,zus_form,business_start_date,cooperation_start_date,father_name,mother_name,tax_office,contact_email,service_language,settlement_frequency,client_status,source_lead_id,profile_complete,created_at,updated_at
        FROM clients
        ORDER BY created_at DESC
      `;
      return res.status(200).json(rows);
    }

    if(req.method==='POST'){
      const b=req.body||{};
      const name=String(b.name||'').trim();
      const firstName=String(b.first_name||'').trim();
      const lastName=String(b.last_name||'').trim();
      const contactName=[firstName,lastName].filter(Boolean).join(' ');
      const entityType=['jdg','company','foundation'].includes(b.entity_type)?b.entity_type:null;
      const nip=digits(b.nip);
      const pesel=digits(b.pesel);
      const krs=digits(b.krs);
      const regon=digits(b.regon);
      const residenceAddress=String(b.residence_address||'').trim();
      const businessAddress=String(b.business_address||'').trim();
      const correspondenceAddress=String(b.correspondence_address||'').trim();
      const taxationForm=String(b.taxation_form||'').trim();
      const vatStatus=String(b.vat_status||'').trim();
      const zusForm=String(b.zus_form||'').trim();
      const businessStartDate=b.business_start_date||null;
      const cooperationStartDate=b.cooperation_start_date||null;
      const fatherName=String(b.father_name||'').trim();
      const motherName=String(b.mother_name||'').trim();
      const taxOffice=String(b.tax_office||'').trim();
      const contactEmail=String(b.contact_email||'').trim();
      const serviceLanguage=String(b.service_language||'Polski').trim()||'Polski';
      const settlementFrequency=String(b.settlement_frequency||'miesięcznie').trim()||'miesięcznie';
      const clientStatus=['active','suspended','inactive','payment_hold'].includes(b.client_status)?b.client_status:'active';

      if(!name||!entityType||!nip){
        return res.status(400).json({error:'Uzupełnij nazwę, typ podmiotu oraz NIP.'});
      }
      if(!entityType) return res.status(400).json({error:'Wybierz typ podmiotu.'});
      if(entityType==='jdg' && (!firstName||!lastName)) return res.status(400).json({error:'Dla JDG podaj imię i nazwisko.'});
      if(nip.length!==10) return res.status(400).json({error:'NIP powinien mieć 10 cyfr.'});
      if(entityType==='jdg' && pesel.length!==11) return res.status(400).json({error:'Dla JDG podaj PESEL składający się z 11 cyfr.'});
      if(entityType!=='jdg' && !krs) return res.status(400).json({error:'Dla spółki lub fundacji podaj KRS.'});

      const duplicate=await sql`SELECT id FROM clients WHERE nip=${nip} LIMIT 1`;
      if(duplicate[0]) return res.status(409).json({error:'Klient z tym NIP-em już istnieje.'});

      const rows=await sql`
        INSERT INTO clients(
          name,contact_name,first_name,last_name,entity_type,nip,pesel,krs,regon,
          residence_address,business_address,correspondence_address,taxation_form,vat_status,zus_form,
          business_start_date,cooperation_start_date,father_name,mother_name,tax_office,contact_email,
          service_language,settlement_frequency,client_status
        )
        VALUES(
          ${name},
          ${entityType==='jdg'?contactName:null},
          ${entityType==='jdg'?firstName:null},
          ${entityType==='jdg'?lastName:null},
          ${entityType},
          ${nip},
          ${entityType==='jdg'?pesel:null},
          ${entityType==='jdg'?null:krs},
          ${regon||null},
          ${residenceAddress},
          ${businessAddress},
          ${correspondenceAddress},
          ${taxationForm},
          ${vatStatus},
          ${zusForm},
          ${businessStartDate},
          ${cooperationStartDate},
          ${entityType==='jdg'?fatherName:''},
          ${entityType==='jdg'?motherName:''},
          ${taxOffice},
          ${contactEmail},
          ${serviceLanguage},
          ${settlementFrequency},
          ${clientStatus}
        )
        RETURNING id,name,contact_name,first_name,last_name,entity_type,nip,pesel,krs,regon,residence_address,business_address,correspondence_address,taxation_form,vat_status,zus_form,business_start_date,cooperation_start_date,father_name,mother_name,tax_office,contact_email,service_language,settlement_frequency,client_status,source_lead_id,profile_complete,created_at,updated_at
      `;
      await sql`
        INSERT INTO client_status_events(client_id,from_status,to_status,actor_id,actor_name)
        VALUES(${rows[0].id},NULL,${clientStatus},${Number(user.id)},${user.full_name})
      `;
      return res.status(201).json(rows[0]);
    }

    if(req.method==='PATCH'){
      const b=req.body||{},id=Number(b.id);
      if(!id)return res.status(400).json({error:'Brak id klienta.'});
      const current=(await sql`SELECT * FROM clients WHERE id=${id} LIMIT 1`)[0];
      if(!current)return res.status(404).json({error:'Nie znaleziono klienta.'});

      const name=String(b.name??current.name).trim();
      const firstName=String(b.first_name??current.first_name??'').trim();
      const lastName=String(b.last_name??current.last_name??'').trim();
      const contactName=[firstName,lastName].filter(Boolean).join(' ');
      const entityType=['jdg','company','foundation'].includes(b.entity_type)?b.entity_type:current.entity_type;
      const nip=digits(b.nip??current.nip);
      const pesel=digits(b.pesel??current.pesel);
      const krs=digits(b.krs??current.krs);
      const regon=digits(b.regon??current.regon);
      const residenceAddress=String(b.residence_address??current.residence_address??'').trim();
      const businessAddress=String(b.business_address??current.business_address??'').trim();
      const correspondenceAddress=String(b.correspondence_address??current.correspondence_address??'').trim();
      const taxationForm=String(b.taxation_form??current.taxation_form??'').trim();
      const vatStatus=String(b.vat_status??current.vat_status??'').trim();
      const zusForm=String(b.zus_form??current.zus_form??'').trim();
      const businessStartDate=b.business_start_date===undefined?current.business_start_date:(b.business_start_date||null);
      const cooperationStartDate=b.cooperation_start_date===undefined?current.cooperation_start_date:(b.cooperation_start_date||null);
      const fatherName=String(b.father_name??current.father_name??'').trim();
      const motherName=String(b.mother_name??current.mother_name??'').trim();
      const taxOffice=String(b.tax_office??current.tax_office??'').trim();
      const contactEmail=String(b.contact_email??current.contact_email??'').trim();
      const serviceLanguage=String(b.service_language??current.service_language??'Polski').trim()||'Polski';
      const settlementFrequency=String(b.settlement_frequency??current.settlement_frequency??'miesięcznie').trim()||'miesięcznie';
      const clientStatus=b.client_status===undefined?current.client_status:(['active','suspended','inactive','payment_hold'].includes(b.client_status)?b.client_status:current.client_status);

      if(!entityType) return res.status(400).json({error:'Wybierz typ podmiotu.'});
      if(entityType==='jdg' && (!firstName||!lastName)) return res.status(400).json({error:'Dla JDG podaj imię i nazwisko.'});
      if(nip.length!==10) return res.status(400).json({error:'NIP powinien mieć 10 cyfr.'});
      if(entityType==='jdg' && pesel.length!==11) return res.status(400).json({error:'Dla JDG podaj PESEL składający się z 11 cyfr.'});
      if(entityType!=='jdg' && !krs) return res.status(400).json({error:'Dla spółki lub fundacji podaj KRS.'});

      const duplicate=await sql`SELECT id FROM clients WHERE nip=${nip} AND id<>${id} LIMIT 1`;
      if(duplicate[0]) return res.status(409).json({error:'Inny klient ma już ten NIP.'});

      const rows=await sql`
        UPDATE clients SET
          name=${name},
          contact_name=${entityType==='jdg'?contactName:null},
          first_name=${entityType==='jdg'?firstName:null},
          last_name=${entityType==='jdg'?lastName:null},
          entity_type=${entityType},
          nip=${nip},
          pesel=${entityType==='jdg'?pesel:null},
          krs=${entityType==='jdg'?null:krs},
          regon=${regon||null},
          residence_address=${residenceAddress},
          business_address=${businessAddress},
          correspondence_address=${correspondenceAddress},
          taxation_form=${taxationForm},
          vat_status=${vatStatus},
          zus_form=${zusForm},
          business_start_date=${businessStartDate},
          cooperation_start_date=${cooperationStartDate},
          father_name=${entityType==='jdg'?fatherName:''},
          mother_name=${entityType==='jdg'?motherName:''},
          tax_office=${taxOffice},
          contact_email=${contactEmail},
          service_language=${serviceLanguage},
          settlement_frequency=${settlementFrequency},
          client_status=${clientStatus},
          profile_complete=TRUE,
          updated_at=NOW()
        WHERE id=${id}
        RETURNING id,name,contact_name,first_name,last_name,entity_type,nip,pesel,krs,regon,residence_address,business_address,correspondence_address,taxation_form,vat_status,zus_form,business_start_date,cooperation_start_date,father_name,mother_name,tax_office,contact_email,service_language,settlement_frequency,client_status,source_lead_id,profile_complete,created_at,updated_at
      `;
      if(clientStatus!==current.client_status){
        await sql`
          INSERT INTO client_status_events(client_id,from_status,to_status,actor_id,actor_name)
          VALUES(${id},${current.client_status},${clientStatus},${Number(user.id)},${user.full_name})
        `;
      }
      return res.status(200).json(rows[0]);
    }

    if(req.method==='DELETE'){
      if(user.role==='employee')return res.status(403).json({error:'Brak uprawnień do usuwania klientów.'});
      const id=Number(req.query.id);
      if(!id)return res.status(400).json({error:'Brak id klienta.'});
      await sql`DELETE FROM clients WHERE id=${id}`;
      return res.status(204).end();
    }

    return res.status(405).json({error:'Method not allowed'});
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e.message||'Błąd serwera'});
  }
}
