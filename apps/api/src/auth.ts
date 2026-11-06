import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Express, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { loginSchema } from '@atlas/shared';

const cookieName='atlas_session';
const sessionLifeMs=12*60*60*1000;
const attempts=new Map<string,{count:number;until:number}>();
const digest=(input:string)=>createHash('sha256').update(input).digest('hex');
const secret=()=>process.env.SESSION_SECRET ?? '';
const enabled=()=>!!(secret().length>=32 && process.env.ADMIN_PASSWORD_HASH);
const hmac=(value:string)=>createHmac('sha256',secret()).update(value).digest('base64url');

function safeCompare(a:string,b:string) {
  const left=Buffer.from(a),right=Buffer.from(b);
  return left.length===right.length && timingSafeEqual(left,right);
}
function tokenFromRequest(req:Request):string|null {
  if(!enabled()) return null;
  const cookie=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='));
  if(!cookie) return null;
  const signed=cookie.slice(cookieName.length+1);
  const [token,sig,...rest]=signed.split('.');
  if(rest.length || !token || !sig || !/^[A-Za-z0-9_-]{32,}$/.test(token)) return null;
  if(!safeCompare(sig,hmac(token))) return null;
  return token;
}
export async function sessionFor(req:Request,db:PrismaClient) {
  const token=tokenFromRequest(req);
  if(!token) return null;
  const row=await db.adminSession.findUnique({where:{idHash:digest(token)}});
  if(!row||row.expiresAt.getTime()<=Date.now()) return null;
  const csrf=hmac('csrf:'+token);
  if(!safeCompare(digest(csrf),row.csrfHash)) return null;
  return {idHash:row.idHash,csrf};
}
function cookieOptions() {
  return {
    httpOnly:true,sameSite:'strict' as const,
    secure:process.env.NODE_ENV==='production',path:'/',maxAge:sessionLifeMs,
  };
}
function sameOrigin(req:Request){
  const origin=req.headers.origin;
  if(!origin) return true; // non-browser clients still require CSRF
  try{
    const url=new URL(origin);
    const host=req.headers.host??'';
    return url.host===host ||
      (process.env.NODE_ENV!=='production' && ['localhost:5173','127.0.0.1:5173'].includes(url.host) &&
        ['localhost:3001','127.0.0.1:3001'].includes(host));
  }catch{return false;}
}
export function registerAuth(app:Express,db:PrismaClient){
  app.use('/api/auth',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  app.get('/api/auth/me',async(req,res,next)=>{
    try{
      const s=await sessionFor(req,db);
      res.json(s?{authenticated:true,csrfToken:s.csrf}:{authenticated:false});
    }catch(e){next(e);}
  });
  app.post('/api/auth/login',async(req,res,next)=>{
    try{
      if(!sameOrigin(req)){res.status(403).json({error:{code:'ORIGIN',message:'Недоверенный Origin'}});return;}
      if(!req.is('application/json')){res.status(415).json({error:{code:'CONTENT_TYPE',message:'Ожидается JSON'}});return;}
      if(!enabled()){res.status(503).json({error:{code:'AUTH_NOT_CONFIGURED',message:'Задайте ADMIN_PASSWORD_HASH и SESSION_SECRET в .env'}});return;}
      const key=req.ip??'unknown',now=Date.now(),prior=attempts.get(key);
      if(prior&&prior.count>=5&&prior.until>now){
        res.status(429).json({error:{code:'RATE_LIMIT',message:'Слишком много попыток входа'}});return;
      }
      const input=loginSchema.safeParse(req.body);
      if(!input.success){res.status(400).json({error:{code:'BAD_INPUT',message:'Некорректный пароль'}});return;}
      const valid=await bcrypt.compare(input.data.password,process.env.ADMIN_PASSWORD_HASH!);
      if(!valid){
        const previous=prior&&prior.until>now?prior.count:0;
        attempts.set(key,{count:previous+1,until:now+15*60*1000});
        res.status(401).json({error:{code:'INVALID_CREDENTIALS',message:'Неверный пароль'}});return;
      }
      attempts.delete(key);
      const token=randomBytes(32).toString('base64url');
      const csrf=hmac('csrf:'+token);
      await db.adminSession.create({data:{idHash:digest(token),csrfHash:digest(csrf),
        expiresAt:new Date(now+sessionLifeMs)}});
      res.cookie(cookieName,token+'.'+hmac(token),cookieOptions());
      res.json({authenticated:true,csrfToken:csrf});
    }catch(e){next(e);}
  });
  app.post('/api/auth/logout', requireAdmin(db),async(req,res,next)=>{
    try{
      const token=tokenFromRequest(req);
      if(token)await db.adminSession.deleteMany({where:{idHash:digest(token)}});
      res.clearCookie(cookieName,{path:'/',sameSite:'strict',secure:process.env.NODE_ENV==='production'});
      res.json({ok:true});
    }catch(e){next(e);}
  });
}
export function requireAdmin(db:PrismaClient) {
  return async(req:Request,res:Response,next:NextFunction)=>{
    try{
      const session=await sessionFor(req,db);
      if(!session){res.status(401).json({error:{code:'UNAUTHORIZED',message:'Требуется вход администратора'}});return;}
      if(!sameOrigin(req)){res.status(403).json({error:{code:'ORIGIN',message:'Недоверенный Origin'}});return;}
      const csrf=req.headers['x-csrf-token'];
      if(typeof csrf!=='string'||!safeCompare(csrf,session.csrf)){
        res.status(403).json({error:{code:'CSRF',message:'Некорректный CSRF-токен'}});return;
      }
      next();
    }catch(e){next(e);}
  };
}
