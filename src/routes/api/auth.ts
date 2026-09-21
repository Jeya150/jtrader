import {createFileRoute} from '@tanstack/react-router';
import {db,pw,user,session,checkRateLimit} from '../../lib/course.server';
import {ADMIN_EMAIL} from '../../lib/config.server';
import {bindings} from '../../lib/bindings.server';

async function sendOtpEmail(to:string,otp:string,name:string){
  const key=(bindings() as any).RESEND_API_KEY;
  if(!key) return;
  await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
    body:JSON.stringify({
      from:'JTrader Academy <onboarding@resend.dev>',
      to:[to],
      subject:'Your JTrader password reset OTP',
      html:`<div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#111">Password Reset</h2>
        <p>Hi ${name||'there'},</p>
        <p>Your one-time password (OTP) to reset your JTrader Academy password is:</p>
        <div style="font-size:36px;font-weight:900;letter-spacing:8px;color:#080a0d;background:#f4f7fb;padding:20px;text-align:center;border-radius:10px;margin:20px 0">${otp}</div>
        <p style="color:#888;font-size:12px">This OTP is valid for <b>10 minutes</b>. Do not share it with anyone.</p>
        <p style="color:#888;font-size:12px">If you did not request this, ignore this email.</p>
      </div>`
    })
  }).catch(()=>{});
}

const DISPOSABLE_DOMAINS=new Set([
  'mailinator.com','guerrillamail.com','guerrillamail.net','guerrillamail.org',
  'guerrillamail.biz','guerrillamail.de','sharklasers.com','guerrillamailblock.com',
  'grr.la','guerrillamail.info','spam4.me','tempmail.com','temp-mail.org',
  'throwam.com','throwam.net','trashmail.com','trashmail.me','trashmail.at',
  'trashmail.io','trashmail.net','yopmail.com','yopmail.fr','cool.fr.nf',
  'jetable.fr.nf','nospam.ze.tc','nomail.xl.cx','mega.zik.dj','speed.1s.fr',
  'courriel.fr.nf','moncourrier.fr.nf','monemail.fr.nf','monmail.fr.nf',
  'dispostable.com','mailnull.com','maildrop.cc','mailnesia.com','mailnull.com',
  'discard.email','fakeinbox.com','fakeinbox.net','spamgourmet.com','spamgourmet.net',
  'spamgourmet.org','10minutemail.com','10minutemail.net','10minutemail.org',
  'tempinbox.com','spambox.us','spamfree24.org','spamtrap.ro','throwam.com',
  'getnada.com','nada.ltd','discard.email','filzmail.com','sharklasers.com',
  'guerrillamail.com','spam.la','binkmail.com','bob.email','clrmail.com',
  'dm.w3internet.co.uk','dropmail.me','emailsensei.com','trbvm.com',
  'trillianpro.com','proxymail.eu','rcpt.at','trash-mail.at','t.psh.me',
]);

export const Route=createFileRoute('/api/auth')({
  server:{
    handlers:{
      POST:async({request})=>{
        const action=new URL(request.url).searchParams.get('action')||'';
        const ip=request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')||'unknown';

        // Rate limit: 10 attempts per 15 minutes per IP
        if(action==='login'||action==='register'){
          const allowed=await checkRateLimit(ip,`auth-${action}`);
          if(!allowed){
            return Response.json(
              {error:'Too many attempts. Please wait 15 minutes and try again.'},
              {status:429}
            );
          }
        }

        const d=await request.json().catch(()=>({}));

        if(action==='register'){
          const name=String(d.name||'').trim();
          const email=String(d.email||'').toLowerCase().trim();
          const password=String(d.password||'');
          const city=String(d.city||'').trim();
          const contactNumber=String(d.contactNumber||'').trim();

          if(!name || !email || !password || password.length<8){
            return Response.json(
              {error:'Enter name, email and an 8+ character password'},
              {status:400}
            );
          }

          const emailDomain=email.split('@')[1]||'';
          if(DISPOSABLE_DOMAINS.has(emailDomain)){
            return Response.json(
              {error:'Please use a real email address. Temporary or disposable emails are not allowed.'},
              {status:400}
            );
          }

          const VALID_CITIES=new Set(['Ahmedabad','Amritsar','Aurangabad','Bengaluru','Bhopal','Bhubaneswar','Chandigarh','Chennai','Coimbatore','Delhi','Faridabad','Ghaziabad','Gurgaon','Guwahati','Hyderabad','Indore','Jaipur','Jalandhar','Jodhpur','Kanpur','Kochi','Kolkata','Lucknow','Ludhiana','Madurai','Meerut','Mumbai','Mysuru','Nagpur','Nashik','Navi Mumbai','Noida','Patna','Pune','Raipur','Rajkot','Ranchi','Surat','Thane','Tiruchirappalli','Vadodara','Varanasi','Vijayawada','Visakhapatnam']);
          if(!city || !VALID_CITIES.has(city)){
            return Response.json(
              {error:'Please select a valid city from the list'},
              {status:400}
            );
          }

          const existing=await db()
            .prepare('SELECT id FROM users WHERE email=?')
            .bind(email)
            .first();

          if(existing){
            return Response.json(
              {error:'Email already registered'},
              {status:409}
            );
          }

          const id=crypto.randomUUID();
          const h=await pw(password);

          try{
            await db()
              .prepare(
                `INSERT INTO users
                (id,name,email,password_hash,password_salt,role,city,contact_number)
                VALUES(?,?,?,?,?,?,?,?)`
              )
              .bind(
                id,
                name,
                email,
                h.hash,
                h.salt,
                'student',
                city,
                contactNumber
              )
              .run();
          }catch(error){
            const message=String(error);

            if(
              message.includes('contact_number') ||
              message.includes('no such column')
            ){
              await db()
                .prepare(
                  `INSERT INTO users
                  (id,name,email,password_hash,password_salt,role,city)
                  VALUES(?,?,?,?,?,?,?)`
                )
                .bind(
                  id,
                  name,
                  email,
                  h.hash,
                  h.salt,
                  'student',
                  city
                )
                .run();
            }else{
              console.error('REGISTER ERROR:',error);

              return Response.json(
                {error:'Registration failed. Please try again.'},
                {status:500}
              );
            }
          }

          // Send welcome email
          const resendKey=(bindings() as any).RESEND_API_KEY;
          if(resendKey){
            fetch('https://api.resend.com/emails',{
              method:'POST',
              headers:{'Content-Type':'application/json','Authorization':`Bearer ${resendKey}`},
              body:JSON.stringify({
                from:'JTrader Academy <onboarding@resend.dev>',
                to:[email],
                subject:'Welcome to JTrader Academy! 🎉',
                html:`<div style="font-family:sans-serif;max-width:560px;margin:auto;background:#07090d;color:#f4f7fb;padding:32px;border-radius:16px">
                  <h1 style="font-size:28px;margin:0 0 8px;letter-spacing:-1px">Welcome, ${name}! 🎉</h1>
                  <p style="color:#8996a6;margin:0 0 24px">You've successfully joined <b style="color:#fff">JTrader Academy</b> — India's practical trading education platform.</p>
                  <div style="background:#0c1118;border:1px solid #202a36;border-radius:12px;padding:20px;margin-bottom:24px">
                    <p style="margin:0 0 8px;font-size:13px;color:#8996a6">Your login details:</p>
                    <p style="margin:0;font-size:14px"><b>Email:</b> ${email}</p>
                    <p style="margin:4px 0 0;font-size:12px;color:#596778">Use the password you just created</p>
                  </div>
                  <a href="https://jtrader.in" style="display:inline-block;background:#fff;color:#080a0d;padding:14px 28px;border-radius:10px;font-weight:900;font-size:13px;text-decoration:none;margin-bottom:24px">Go to Dashboard →</a>
                  <p style="color:#596778;font-size:12px;margin:0">Browse our courses and start your trading journey. If you have any questions, reply to this email.</p>
                  <hr style="border:none;border-top:1px solid #161d26;margin:24px 0"/>
                  <p style="color:#3d4d5c;font-size:10px;margin:0">JTrader Academy · jtrader.in · Trading Education</p>
                </div>`
              })
            }).catch(()=>{});
          }

          return Response.json(
            {ok:true,role:'student'},
            {
              headers:{
                'Set-Cookie':await session(id)
              }
            }
          );
        }

        if(action==='login'){
          const email=String(d.email||'').toLowerCase().trim();
          const password=String(d.password||'');

          const u=await db()
            .prepare('SELECT * FROM users WHERE email=?')
            .bind(email)
            .first<any>();

          if(
            !u ||
            !u.password_salt ||
            (await pw(password,u.password_salt)).hash!==u.password_hash
          ){
            return Response.json(
              {error:'Invalid email or password'},
              {status:401}
            );
          }

          if(u.blocked){
            return Response.json(
              {error:'Your account has been suspended. Contact support.'},
              {status:403}
            );
          }

          return Response.json(
            {
              ok:true,
              role:u.role
            },
            {
              headers:{
                'Set-Cookie':await session(u.id)
              }
            }
          );
        }

        if(action==='logout'){
          return new Response(null,{
            status:204,
            headers:{
              'Set-Cookie':
                '__Host-jtrader_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
            }
          });
        }

        if(action==='forgot-password'){
          const email=String(d.email||'').toLowerCase().trim();
          if(!email) return Response.json({error:'Email required'},{status:400});

          // Rate limit: 3 OTP requests per 15 min per IP
          const allowed=await checkRateLimit(ip,'forgot-otp',3,15);
          if(!allowed) return Response.json({error:'Too many requests. Wait 15 minutes.'},{status:429});

          const u2=await db().prepare('SELECT id,name,email FROM users WHERE email=?').bind(email).first<any>();
          // Always return ok (don't reveal if email exists)
          if(u2){
            const otp=String(100000+crypto.getRandomValues(new Uint32Array(1))[0]%900000);
            const expires=new Date(Date.now()+10*60000).toISOString().replace('T',' ').replace('Z','');
            // Invalidate old OTPs for this email
            await db().prepare('UPDATE otp_requests SET used=1 WHERE email=?').bind(email).run();
            await db().prepare('INSERT INTO otp_requests(id,email,otp,expires_at) VALUES(?,?,?,?)')
              .bind(crypto.randomUUID(),email,otp,expires).run();
            await sendOtpEmail(email,otp,u2.name||'');
          }
          return Response.json({ok:true,message:'If this email is registered, an OTP has been sent.'});
        }

        if(action==='reset-password'){
          const email=String(d.email||'').toLowerCase().trim();
          const otp=String(d.otp||'').trim();
          const newPassword=String(d.newPassword||'');
          if(!email||!otp||!newPassword) return Response.json({error:'Email, OTP and new password required'},{status:400});
          if(newPassword.length<8) return Response.json({error:'Password must be at least 8 characters'},{status:400});

          const record=await db()
            .prepare("SELECT id FROM otp_requests WHERE email=? AND otp=? AND used=0 AND expires_at>datetime('now') ORDER BY rowid DESC LIMIT 1")
            .bind(email,otp).first<any>();
          if(!record) return Response.json({error:'Invalid or expired OTP'},{status:400});

          const h=await pw(newPassword);
          await db().prepare('UPDATE users SET password_hash=?,password_salt=? WHERE email=?')
            .bind(h.hash,h.salt,email).run();
          await db().prepare('UPDATE otp_requests SET used=1 WHERE id=?').bind(record.id).run();
          // Clear all sessions for this user for security
          const u3=await db().prepare('SELECT id FROM users WHERE email=?').bind(email).first<any>();
          if(u3) await db().prepare('DELETE FROM sessions WHERE user_id=?').bind(u3.id).run();

          return Response.json({ok:true,message:'Password reset successful. Please login.'});
        }

        return Response.json(
          {error:'Unknown action'},
          {status:404}
        );
      },

      GET:async({request})=>{
        const u=await user(request);

        if(!u){
          return Response.json({user:null});
        }

        let basic:any=null;
        let option:any=null;

        try{
          basic=await db()
            .prepare(
              `SELECT expires_at
               FROM entitlements
               WHERE user_id=?
               AND course_id=?
               AND expires_at>datetime('now')
               ORDER BY expires_at DESC
               LIMIT 1`
            )
            .bind(u.id,'basic-share-market')
            .first<any>();

          option=await db()
            .prepare(
              `SELECT expires_at
               FROM entitlements
               WHERE user_id=?
               AND course_id=?
               AND expires_at>datetime('now')
               ORDER BY expires_at DESC
               LIMIT 1`
            )
            .bind(u.id,'option-trading')
            .first<any>();
        }catch(error){
          console.error('ENTITLEMENT CHECK ERROR:',error);
        }

        // Only expose admin role for the authorised email
        const safeUser={...u,role:u.role==='admin'&&u.email!==ADMIN_EMAIL?'student':u.role};

        const broadcast=await db().prepare('SELECT message FROM broadcasts ORDER BY rowid DESC LIMIT 1').first<any>().catch(()=>null);

        return Response.json({
          user:safeUser,
          broadcast:broadcast?.message||null,
          expiresAt:option?.expires_at||basic?.expires_at||null,
          courses:{
            basic:!!basic,
            option:!!option
          },
          courseExpiry:{
            basic:basic?.expires_at||null,
            option:option?.expires_at||null
          }
        });
      }
    }
  }
});
