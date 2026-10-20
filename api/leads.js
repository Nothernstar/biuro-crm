import { db, ensureSchema } from '../lib/db.js';
import { requireUser } from '../lib/auth.js';

export default async function handler(req,res){
  try{
    await ensureSchema();
    const user=await requireUser(req,res);
    if(!user)return;
    const sql=db();
    const ownOnly=user.role==='employee';

    if(req.method==='GET'){
      const rows=ownOnly
        ? await sql`SELECT id,company,contact,email,phone,source,mrr::float8 AS mrr,grade,stage,followup::text AS followup,note,owner,created_at,updated_at FROM leads WHERE owner=${user.full_name} ORDER BY created_at DESC`
        : await sql`SELECT id,company,contact,email,phone,source,mrr::float8 AS mrr,grade,stage,followup::text AS followup,note,owner,created_at,updated_at FROM leads ORDER BY created_at DESC`;
      return res.status(200).json(rows);
    }

    if(req.method==='POST'){
      const b=req.body||{};
      if(!b.company||!b.contact)return res.status(400).json({error:'Firma i osoba kontaktowa są wymagane.'});
      const owner=ownOnly?user.full_name:(b.owner||user.full_name||'Nieprzypisany');
      const rows=await sql`
        INSERT INTO leads(company,contact,email,phone,source,mrr,grade,stage,followup,note,owner)
        VALUES(${b.company},${b.contact},${b.email||''},${b.phone||''},${b.source||'Inne'},${Number(b.mrr)||0},${b.grade||'B'},${b.stage||'Nowy lead'},${b.followup||null},${b.note||''},${owner})
        RETURNING id,company,contact,email,phone,source,mrr::float8 AS mrr,grade,stage,followup::text AS followup,note,owner,created_at,updated_at`;
      return res.status(201).json(rows[0]);
    }

    if(req.method==='PATCH'){
      const b=req.body||{},id=Number(b.id);
      if(!id)return res.status(400).json({error:'Brak id.'});
      if(ownOnly){
        const allowed=await sql`SELECT id FROM leads WHERE id=${id} AND owner=${user.full_name}`;
        if(!allowed[0])return res.status(403).json({error:'Brak dostępu do tego leada.'});
      }
      const owner=ownOnly?null:(b.owner??null);
      const rows=await sql`
        UPDATE leads SET
          company=COALESCE(${b.company??null},company),
          contact=COALESCE(${b.contact??null},contact),
          email=COALESCE(${b.email??null},email),
          phone=COALESCE(${b.phone??null},phone),
          source=COALESCE(${b.source??null},source),
          mrr=COALESCE(${b.mrr!==undefined?Number(b.mrr):null},mrr),
          grade=COALESCE(${b.grade??null},grade),
          stage=COALESCE(${b.stage??null},stage),
          followup=CASE WHEN ${b.followup===''} THEN NULL ELSE COALESCE(${b.followup??null}::date,followup) END,
          note=COALESCE(${b.note??null},note),
          owner=COALESCE(${owner},owner),
          updated_at=NOW()
        WHERE id=${id}
        RETURNING id,company,contact,email,phone,source,mrr::float8 AS mrr,grade,stage,followup::text AS followup,note,owner,created_at,updated_at`;
      if(!rows[0])return res.status(404).json({error:'Nie znaleziono leada.'});
      return res.status(200).json(rows[0]);
    }

    if(req.method==='DELETE'){
      if(ownOnly)return res.status(403).json({error:'Pracownik nie może usuwać leadów.'});
      const id=Number(req.query.id);if(!id)return res.status(400).json({error:'Brak id.'});
      await sql`DELETE FROM leads WHERE id=${id}`;return res.status(204).end();
    }

    return res.status(405).json({error:'Method not allowed'});
  }catch(e){console.error(e);return res.status(500).json({error:e.message||'Błąd serwera'})}
}
