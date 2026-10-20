import { db, ensureSchema } from '../lib/db.js';
import { requireUser } from '../lib/auth.js';

const digits=value=>String(value||'').replace(/\D/g,'');

export default async function handler(req,res){
  try{
    await ensureSchema();
    const user=await requireUser(req,res);
    if(!user)return;
    const sql=db();

    if(req.method==='GET'){
      const rows=await sql`
        SELECT id,name,contact_name,entity_type,nip,pesel,krs,regon,created_at,updated_at
        FROM clients
        ORDER BY created_at DESC
      `;
      return res.status(200).json(rows);
    }

    if(req.method==='POST'){
      const b=req.body||{};
      const name=String(b.name||'').trim();
      const contactName=String(b.contact_name||'').trim();
      const entityType=['jdg','company','foundation'].includes(b.entity_type)?b.entity_type:null;
      const nip=digits(b.nip);
      const pesel=digits(b.pesel);
      const krs=digits(b.krs);
      const regon=digits(b.regon);

      if(!name||!entityType||!nip){
        return res.status(400).json({error:'Uzupełnij nazwę, typ podmiotu oraz NIP.'});
      }
      if(entityType==='jdg' && !contactName) return res.status(400).json({error:'Dla JDG podaj imię i nazwisko.'});
      if(nip.length!==10) return res.status(400).json({error:'NIP powinien mieć 10 cyfr.'});
      if(entityType==='jdg' && pesel.length!==11) return res.status(400).json({error:'Dla JDG podaj PESEL składający się z 11 cyfr.'});
      if(entityType!=='jdg' && !krs) return res.status(400).json({error:'Dla spółki lub fundacji podaj KRS.'});

      const duplicate=await sql`SELECT id FROM clients WHERE nip=${nip} LIMIT 1`;
      if(duplicate[0]) return res.status(409).json({error:'Klient z tym NIP-em już istnieje.'});

      const rows=await sql`
        INSERT INTO clients(name,contact_name,entity_type,nip,pesel,krs,regon)
        VALUES(
          ${name},
          ${entityType==='jdg'?contactName:null},
          ${entityType},
          ${nip},
          ${entityType==='jdg'?pesel:null},
          ${entityType==='jdg'?null:krs},
          ${regon||null}
        )
        RETURNING id,name,contact_name,entity_type,nip,pesel,krs,regon,created_at,updated_at
      `;
      return res.status(201).json(rows[0]);
    }

    if(req.method==='PATCH'){
      const b=req.body||{},id=Number(b.id);
      if(!id)return res.status(400).json({error:'Brak id klienta.'});
      const current=(await sql`SELECT * FROM clients WHERE id=${id} LIMIT 1`)[0];
      if(!current)return res.status(404).json({error:'Nie znaleziono klienta.'});

      const name=String(b.name??current.name).trim();
      const contactName=String(b.contact_name??current.contact_name).trim();
      const entityType=['jdg','company','foundation'].includes(b.entity_type)?b.entity_type:current.entity_type;
      const nip=digits(b.nip??current.nip);
      const pesel=digits(b.pesel??current.pesel);
      const krs=digits(b.krs??current.krs);
      const regon=digits(b.regon??current.regon);

      if(entityType==='jdg' && !contactName) return res.status(400).json({error:'Dla JDG podaj imię i nazwisko.'});
      if(nip.length!==10) return res.status(400).json({error:'NIP powinien mieć 10 cyfr.'});
      if(entityType==='jdg' && pesel.length!==11) return res.status(400).json({error:'Dla JDG podaj PESEL składający się z 11 cyfr.'});
      if(entityType!=='jdg' && !krs) return res.status(400).json({error:'Dla spółki lub fundacji podaj KRS.'});

      const duplicate=await sql`SELECT id FROM clients WHERE nip=${nip} AND id<>${id} LIMIT 1`;
      if(duplicate[0]) return res.status(409).json({error:'Inny klient ma już ten NIP.'});

      const rows=await sql`
        UPDATE clients SET
          name=${name},
          contact_name=${entityType==='jdg'?contactName:null},
          entity_type=${entityType},
          nip=${nip},
          pesel=${entityType==='jdg'?pesel:null},
          krs=${entityType==='jdg'?null:krs},
          regon=${regon||null},
          updated_at=NOW()
        WHERE id=${id}
        RETURNING id,name,contact_name,entity_type,nip,pesel,krs,regon,created_at,updated_at
      `;
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
