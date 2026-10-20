import { requireUser } from '../lib/auth.js';
import { ensureSchema } from '../lib/db.js';

const digits=v=>String(v||'').replace(/\D/g,'');

async function lookupByNip(nip){
  const date=new Date().toISOString().slice(0,10);
  const url=`https://wl-api.mf.gov.pl/api/search/nip/${encodeURIComponent(nip)}?date=${date}`;
  const response=await fetch(url,{headers:{Accept:'application/json'}});
  if(response.status===404) return null;
  if(!response.ok) throw new Error('Ministerstwo Finansów chwilowo nie odpowiada.');
  const data=await response.json();
  const subject=data?.result?.subject;
  if(!subject) return null;
  return {
    source:'Ministerstwo Finansów — Wykaz podatników VAT',
    name:subject.name||'',
    nip:digits(subject.nip)||nip,
    krs:digits(subject.krs),
    regon:digits(subject.regon),
    status:subject.statusVat||'',
    address:subject.workingAddress||subject.residenceAddress||''
  };
}

function normalizeKrsData(data,krs){
  const odpis=data?.odpis;
  const dzial1=odpis?.dane?.dzial1||{};
  const podmiot=dzial1?.danePodmiotu||{};
  const ids=podmiot?.identyfikatory||{};
  const address=dzial1?.siedzibaIAdres||{};
  const adres=address?.adres||address?.adresSiedziby||{};
  const city=adres?.miejscowosc||'';
  const postal=adres?.kodPocztowy||'';
  const street=[adres?.ulica,adres?.nrDomu,adres?.nrLokalu].filter(Boolean).join(' ');
  return {
    source:'Ministerstwo Sprawiedliwości — Otwarte API KRS',
    name:podmiot?.nazwa||'',
    nip:digits(ids?.nip),
    krs:digits(odpis?.naglowekA?.numerKRS)||krs,
    regon:digits(ids?.regon),
    legal_form:podmiot?.formaPrawna||'',
    address:[street,[postal,city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  };
}

async function lookupKrsRegister(krs,register){
  const url=`https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/${encodeURIComponent(krs)}?rejestr=${register}&format=json`;
  const response=await fetch(url,{headers:{Accept:'application/json'}});
  if(response.status===404) return null;
  if(!response.ok) throw new Error('KRS chwilowo nie odpowiada.');
  const data=await response.json();
  return normalizeKrsData(data,krs);
}

async function lookupByKrs(rawKrs){
  const krs=digits(rawKrs).padStart(10,'0');
  let result=await lookupKrsRegister(krs,'P');
  if(!result) result=await lookupKrsRegister(krs,'S');
  return result;
}

export default async function handler(req,res){
  try{
    await ensureSchema();
    const user=await requireUser(req,res);
    if(!user)return;
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

    const nip=digits(req.body?.nip);
    const krs=digits(req.body?.krs);

    if(!nip&&!krs)return res.status(400).json({error:'Podaj NIP lub KRS.'});
    if(nip&&nip.length!==10)return res.status(400).json({error:'NIP powinien mieć 10 cyfr.'});

    const result=nip?await lookupByNip(nip):await lookupByKrs(krs);
    if(!result)return res.status(404).json({
      error:nip
        ? 'Nie znaleziono podmiotu w publicznym Wykazie podatników VAT.'
        : 'Nie znaleziono podmiotu w KRS.'
    });

    return res.status(200).json(result);
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e.message||'Nie udało się pobrać danych rejestrowych.'});
  }
}
