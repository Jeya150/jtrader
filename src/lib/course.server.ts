import {bindings} from './bindings.server';

const C='__Host-jtrader_session';

export function db(){
  const {DB}=bindings();
  if(!DB) throw new Error('Database unavailable');
  return DB;
}

const hex=(b:Uint8Array)=>
  Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');

export async function pw(p:string,salt?:string){
  const s=salt
    ? Uint8Array.from(
        salt.match(/../g)!.map(x=>parseInt(x,16))
      )
    : crypto.getRandomValues(new Uint8Array(16));

  const k=await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(p),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const b=await crypto.subtle.deriveBits(
    {
      name:'PBKDF2',
      salt:s,
      iterations:100000,
      hash:'SHA-256'
    },
    k,
    256
  );

  return {
    hash:hex(new Uint8Array(b)),
    salt:hex(s)
  };
}

export async function user(r:Request){
  const c=r.headers.get('Cookie')||'';

  const t=c
    .split(';')
    .map(x=>x.trim())
    .find(x=>x.startsWith(C+'='))
    ?.slice(C.length+1);

  if(!t) return null;

  return db()
    .prepare(
      "SELECT u.id,u.name,u.email,u.role,u.contact_number FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>datetime('now')"
    )
    .bind(t)
    .first<any>();
}

export async function hasCourseAccess(
  r:Request,
  courseId:string
){
  const u=await user(r);

  if(!u){
    return {
      user:null,
      allowed:false,
      expires:null
    };
  }

  if(u.role==='admin'){
    return {
      user:u,
      allowed:true,
      expires:null
    };
  }

  if(!courseId){
    return {
      user:u,
      allowed:false,
      expires:null
    };
  }

  const a=await db()
    .prepare(
      "SELECT expires_at FROM entitlements WHERE user_id=? AND course_id=? AND expires_at>datetime('now') ORDER BY expires_at DESC LIMIT 1"
    )
    .bind(u.id,courseId)
    .first<any>();

  return {
    user:u,
    allowed:!!a,
    expires:a?.expires_at||null
  };
}

export async function active(r:Request){
  const u=await user(r);

  if(!u){
    throw new Response('Unauthorized',{status:401});
  }

  if(u.role==='admin'){
    return {
      u,
      expires:null
    };
  }

  const a=await db()
    .prepare(
      "SELECT expires_at FROM entitlements WHERE user_id=? AND expires_at>datetime('now') ORDER BY expires_at DESC LIMIT 1"
    )
    .bind(u.id)
    .first<any>();

  if(!a){
    throw new Response('Course access expired',{status:403});
  }

  return {
    u,
    expires:a.expires_at
  };
}

export async function checkRateLimit(ip:string,action:string,maxAttempts=10,windowMinutes=15):Promise<boolean>{
  try{
    const now=new Date();
    const nowStr=now.toISOString().replace('T',' ').replace('Z','');
    const existing=await db()
      .prepare('SELECT attempts,window_start FROM rate_limits WHERE ip=? AND action=?')
      .bind(ip,action).first<any>();
    if(!existing){
      await db().prepare('INSERT OR REPLACE INTO rate_limits(ip,action,attempts,window_start) VALUES(?,?,1,?)')
        .bind(ip,action,nowStr).run();
      return true;
    }
    const msSince=now.getTime()-new Date(existing.window_start.replace(' ','T')+'Z').getTime();
    if(msSince>windowMinutes*60000){
      await db().prepare('UPDATE rate_limits SET attempts=1,window_start=? WHERE ip=? AND action=?')
        .bind(nowStr,ip,action).run();
      return true;
    }
    if(existing.attempts>=maxAttempts) return false;
    await db().prepare('UPDATE rate_limits SET attempts=attempts+1 WHERE ip=? AND action=?')
      .bind(ip,action).run();
    return true;
  }catch{return true;}
}

export async function session(id:string){
  const t=crypto.randomUUID();

  const e=new Date(Date.now()+604800000)
    .toISOString()
    .replace('T',' ')
    .replace('Z','');

  await db()
    .prepare('INSERT INTO sessions VALUES(?,?,?)')
    .bind(t,id,e)
    .run();

  return `${C}=${t}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=604800`;
}


