import crypto from 'node:crypto';
import { db } from './db.js';

const COOKIE_NAME='brcrm_session';

function b64url(input){
  return Buffer.from(input).toString('base64url');
}
function sign(value){
  const secret=process.env.AUTH_SECRET;
  if(!secret) throw new Error('AUTH_SECRET is not configured');
  return crypto.createHmac('sha256',secret).update(value).digest('base64url');
}
export function hashPassword(password){
  if(typeof password!=='string'||password.length<8) throw new Error('Hasło musi mieć co najmniej 8 znaków.');
  const salt=crypto.randomBytes(16).toString('hex');
  const hash=crypto.scryptSync(password,salt,64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}
export function verifyPassword(password,stored){
  try{
    const [,salt,hash]=stored.split(':');
    const test=crypto.scryptSync(password,salt,64);
    return crypto.timingSafeEqual(test,Buffer.from(hash,'hex'));
  }catch{return false}
}
export function createSessionToken(user){
  const payload=b64url(JSON.stringify({
    id:Number(user.id),
    email:user.email,
    full_name:user.full_name,
    role:user.role,
    exp:Date.now()+1000*60*60*24*7
  }));
  return `${payload}.${sign(payload)}`;
}
export function readSessionToken(token){
  try{
    if(!token) return null;
    const [payload,sig]=token.split('.');
    if(!payload||!sig) return null;
    const expected=sign(payload);
    if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) return null;
    const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    if(!data.exp||Date.now()>data.exp) return null;
    return data;
  }catch{return null}
}
export function setSession(res,user){
  const token=createSessionToken(user);
  res.setHeader('Set-Cookie',`${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=604800`);
}
export function clearSession(res){
  res.setHeader('Set-Cookie',`${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`);
}
function parseCookies(req){
  return Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),decodeURIComponent(v.slice(i+1))]}));
}
export async function getCurrentUser(req){
  const token=parseCookies(req)[COOKIE_NAME];
  const session=readSessionToken(token);
  if(!session) return null;
  const sql=db();
  const rows=await sql`
    SELECT id,email,full_name,role,is_active,must_change_password,created_at,last_login_at
    FROM app_users WHERE id=${Number(session.id)} LIMIT 1
  `;
  const user=rows[0];
  if(!user||!user.is_active) return null;
  return user;
}
export async function requireUser(req,res,roles){
  const user=await getCurrentUser(req);
  if(!user){res.status(401).json({error:'Wymagane logowanie.'});return null}
  if(user.must_change_password){res.status(403).json({error:'Wymagana zmiana hasła.',code:'PASSWORD_CHANGE_REQUIRED'});return null}
  if(roles && !roles.includes(user.role)){res.status(403).json({error:'Brak uprawnień.'});return null}
  return user;
}
