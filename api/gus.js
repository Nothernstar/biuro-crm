import { requireUser } from '../lib/auth.js';
import { ensureSchema } from '../lib/db.js';

const ENDPOINT='https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc';
const NS='http://CIS/BIR/PUBL/2014/07';
const ACTION_LOGIN=NS+'/IUslugaBIRzewnPubl/Zaloguj';
const ACTION_SEARCH=NS+'/IUslugaBIRzewnPubl/WyszukajDane';
const ACTION_LOGOUT=NS+'/IUslugaBIRzewnPubl/Wyloguj';

const esc=s=>String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[m]));
const unescapeXml=s=>String(s||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
const tag=(xml,name)=>{
  const m=String(xml||'').match(new RegExp('<(?:\\w+:)?'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?'+name+'>','i'));
  return m?unescapeXml(m[1].trim()):'';
};
const digits=v=>String(v||'').replace(/\D/g,'');

async function soap(action,body,sid){
  const res=await fetch(ENDPOINT,{
    method:'POST',
    headers:{
      'Content-Type':'application/soap+xml; charset=utf-8',
      'SOAPAction':action,
      ...(sid?{sid}:{})
    },
    body:`<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing">
  <s:Header>
    <a:Action s:mustUnderstand="1">${action}</a:Action>
    <a:To s:mustUnderstand="1">${ENDPOINT}</a:To>
  </s:Header>
  <s:Body>${body}</s:Body>
</s:Envelope>`
  });
  const text=await res.text();
  if(!res.ok) throw new Error('GUS zwrócił błąd połączenia.');
  return text;
}

export default async function handler(req,res){
  try{
    await ensureSchema();
    const user=await requireUser(req,res);
    if(!user)return;
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

    const key=process.env.GUS_API_KEY;
    if(!key)return res.status(503).json({error:'Integracja GUS oczekuje na klucz GUS_API_KEY.'});

    const nip=digits(req.body?.nip),krs=digits(req.body?.krs);
    if(!nip&&!krs)return res.status(400).json({error:'Podaj NIP lub KRS.'});
    if(nip&&nip.length!==10)return res.status(400).json({error:'NIP powinien mieć 10 cyfr.'});

    const loginXml=await soap(ACTION_LOGIN,`
<Zaloguj xmlns="${NS}">
  <pKluczUzytkownika>${esc(key)}</pKluczUzytkownika>
</Zaloguj>`);
    const sid=tag(loginXml,'ZalogujResult');
    if(!sid)throw new Error('GUS nie zwrócił sesji. Sprawdź klucz API.');

    try{
      const searchXml=await soap(ACTION_SEARCH,`
<WyszukajDane xmlns="${NS}">
  <pParametryWyszukiwania xmlns:d4p1="http://CIS/BIR/PUBL/2014/07/DataContract">
    ${nip?`<d4p1:Nip>${esc(nip)}</d4p1:Nip>`:''}
    ${krs?`<d4p1:Krs>${esc(krs)}</d4p1:Krs>`:''}
  </pParametryWyszukiwania>
</WyszukajDane>`,sid);

      const raw=tag(searchXml,'WyszukajDaneResult');
      if(!raw)return res.status(404).json({error:'GUS nie znalazł podmiotu.'});

      const data={
        name:tag(raw,'Nazwa'),
        nip:tag(raw,'Nip')||nip,
        krs:tag(raw,'Krs')||krs,
        regon:tag(raw,'Regon'),
        status:tag(raw,'StatusNip'),
        voivodeship:tag(raw,'Wojewodztwo'),
        county:tag(raw,'Powiat'),
        community:tag(raw,'Gmina'),
        city:tag(raw,'Miejscowosc'),
        postal_code:tag(raw,'KodPocztowy'),
        street:tag(raw,'Ulica')
      };
      return res.status(200).json(data);
    }finally{
      soap(ACTION_LOGOUT,`<Wyloguj xmlns="${NS}"><pIdentyfikatorSesji>${esc(sid)}</pIdentyfikatorSesji></Wyloguj>`,sid).catch(()=>{});
    }
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e.message||'Nie udało się pobrać danych z GUS.'});
  }
}
