export async function addHistory(sql,{title,detail='',actor='',status=''}){
  const suffix=actor?String(detail||'')+(detail?' • ':'')+'przez '+actor:String(detail||'');
  await sql`
    INSERT INTO module_items(module,title,detail,status)
    VALUES('history',${String(title||'Zmiana w systemie')},${suffix},${String(status||'')})
  `;
}
