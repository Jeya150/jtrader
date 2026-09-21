import {createFileRoute} from '@tanstack/react-router';
import {db,user} from '../../lib/course.server';
import {bindings} from '../../lib/bindings.server';

export const Route=createFileRoute('/api/payment')({
  server:{
    handlers:{
      POST:async({request})=>{
        const action=new URL(request.url).searchParams.get('action')||'';
        const u=await user(request);

        if(!u){
          return Response.json(
            {error:'Please login first'},
            {status:401}
          );
        }

        if(action==='create-order'){
          const d=await request.json().catch(()=>({}));
          const courseId=String(d.courseId||'');

          if(
            courseId!=='basic-share-market' &&
            courseId!=='option-trading'
          ){
            return Response.json(
              {error:'Invalid course'},
              {status:400}
            );
          }

          const course=await db()
            .prepare(
              'SELECT id,title,price FROM courses WHERE id=?'
            )
            .bind(courseId)
            .first<any>();

          if(!course){
            return Response.json(
              {error:'Course not found'},
              {status:404}
            );
          }

          const amount=Number(course.price||0);

          if(amount<=0){
            return Response.json(
              {error:'Invalid course price'},
              {status:400}
            );
          }

          const env=bindings();

          if(!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET){
            return Response.json(
              {error:'Razorpay keys are not configured'},
              {status:500}
            );
          }

          const auth=btoa(
            `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`
          );

          const razorpayResponse=await fetch(
            'https://api.razorpay.com/v1/orders',
            {
              method:'POST',
              headers:{
                'Content-Type':'application/json',
                'Authorization':`Basic ${auth}`
              },
              body:JSON.stringify({
                amount:amount*100,
                currency:'INR',
                receipt:`${courseId}-${Date.now()}`,
                notes:{
                  courseId,
                  userId:String(u.id||'')
                }
              })
            }
          );

          const razorpay=await razorpayResponse.json().catch(()=>null);

          if(!razorpayResponse.ok){
            return Response.json(
              {
                error:razorpay?.error?.description||
                  'Razorpay order creation failed'
              },
              {status:500}
            );
          }

          return Response.json({
            ok:true,
            keyId:env.RAZORPAY_KEY_ID,
            orderId:razorpay.id,
            courseId:course.id,
            courseTitle:course.title,
            amount,
            amountPaise:amount*100,
            currency:'INR'
          });
        }

        if(action==='verify-payment'){
          const d=await request.json().catch(()=>({}));
          const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            courseId
          }=d as any;

          if(
            !razorpay_order_id ||
            !razorpay_payment_id ||
            !razorpay_signature ||
            !courseId
          ){
            return Response.json(
              {error:'Missing payment details'},
              {status:400}
            );
          }

          if(
            courseId!=='basic-share-market' &&
            courseId!=='option-trading'
          ){
            return Response.json(
              {error:'Invalid course'},
              {status:400}
            );
          }

          const env=bindings();

          if(!env.RAZORPAY_KEY_SECRET){
            return Response.json(
              {error:'Razorpay not configured'},
              {status:500}
            );
          }

          // Verify Razorpay signature: HMAC-SHA256(orderId + "|" + paymentId, secret)
          const signingBody=`${razorpay_order_id}|${razorpay_payment_id}`;
          const hmacKey=await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(env.RAZORPAY_KEY_SECRET),
            {name:'HMAC',hash:'SHA-256'},
            false,
            ['sign']
          );
          const sigBytes=await crypto.subtle.sign(
            'HMAC',
            hmacKey,
            new TextEncoder().encode(signingBody)
          );
          const expectedSig=Array.from(new Uint8Array(sigBytes))
            .map(b=>b.toString(16).padStart(2,'0'))
            .join('');

          if(expectedSig!==String(razorpay_signature)){
            return Response.json(
              {error:'Payment signature invalid'},
              {status:400}
            );
          }

          // Idempotency: if this order was already recorded, return success
          const existing=await db()
            .prepare('SELECT id FROM payments WHERE provider_order_id=?')
            .bind(razorpay_order_id)
            .first<any>();

          if(existing){
            return Response.json({ok:true});
          }

          const course=await db()
            .prepare('SELECT id,price,access FROM courses WHERE id=?')
            .bind(courseId)
            .first<any>();

          if(!course){
            return Response.json(
              {error:'Course not found'},
              {status:404}
            );
          }

          const paymentId=crypto.randomUUID();
          const entitlementId=crypto.randomUUID();
          const nowMs=Date.now();
          const now=new Date(nowMs).toISOString().replace('T',' ').replace('Z','');

          // Parse access duration: "lifetime", "6 months", "1 year", "30 days", etc.
          function parseAccess(access:string):string{
            const a=(access||'lifetime').toLowerCase().trim();
            if(a==='lifetime'||a==='') return '2099-12-31 00:00:00';
            const num=parseInt(a)||1;
            const d=new Date(nowMs);
            if(a.includes('day')) d.setDate(d.getDate()+num);
            else if(a.includes('week')) d.setDate(d.getDate()+num*7);
            else if(a.includes('month')) d.setMonth(d.getMonth()+num);
            else if(a.includes('year')) d.setFullYear(d.getFullYear()+num);
            else d.setFullYear(d.getFullYear()+99); // fallback = lifetime
            return d.toISOString().replace('T',' ').replace('Z','');
          }
          const expires=parseAccess(course.access);

          await db()
            .prepare(
              'INSERT INTO payments(id,user_id,provider_order_id,provider_payment_id,amount,status) VALUES(?,?,?,?,?,?)'
            )
            .bind(
              paymentId,
              u.id,
              razorpay_order_id,
              razorpay_payment_id,
              course.price,
              'paid'
            )
            .run();

          await db()
            .prepare(
              'INSERT INTO entitlements(id,user_id,course_id,starts_at,expires_at,payment_id) VALUES(?,?,?,?,?,?)'
            )
            .bind(
              entitlementId,
              u.id,
              courseId,
              now,
              expires,
              paymentId
            )
            .run();

          // Send payment receipt to student
          const resendKey=(bindings() as any).RESEND_API_KEY;
          if(resendKey){
            const courseLabel=courseId==='option-trading'?'Option Trading Course':'Basic of Share Market';
            const receiptNo=`JT-${Date.now().toString().slice(-8)}`;
            fetch('https://api.resend.com/emails',{
              method:'POST',
              headers:{'Content-Type':'application/json','Authorization':`Bearer ${resendKey}`},
              body:JSON.stringify({
                from:'JTrader Academy <onboarding@resend.dev>',
                to:[u.email],
                subject:`Payment Receipt — ${courseLabel} 🎓`,
                html:`<div style="font-family:sans-serif;max-width:560px;margin:auto;background:#07090d;color:#f4f7fb;padding:32px;border-radius:16px">
                  <h1 style="font-size:24px;margin:0 0 4px">Payment Successful ✅</h1>
                  <p style="color:#8996a6;margin:0 0 24px;font-size:13px">Thank you for enrolling! Your course is now unlocked.</p>
                  <div style="background:#0c1118;border:1px solid #202a36;border-radius:12px;padding:20px;margin-bottom:24px">
                    <p style="margin:0 0 16px;font-weight:700;font-size:13px;color:#8996a6;letter-spacing:1px">PAYMENT RECEIPT</p>
                    <table style="width:100%;border-collapse:collapse;font-size:13px">
                      <tr><td style="padding:6px 0;color:#8996a6">Receipt No.</td><td style="text-align:right;color:#fff">${receiptNo}</td></tr>
                      <tr><td style="padding:6px 0;color:#8996a6">Student</td><td style="text-align:right;color:#fff">${u.name||'—'}</td></tr>
                      <tr><td style="padding:6px 0;color:#8996a6">Email</td><td style="text-align:right;color:#fff">${u.email}</td></tr>
                      <tr><td style="padding:6px 0;color:#8996a6">Course</td><td style="text-align:right;color:#fff">${courseLabel}</td></tr>
                      <tr><td style="padding:6px 0;color:#8996a6">Payment ID</td><td style="text-align:right;color:#596778;font-size:11px">${razorpay_payment_id}</td></tr>
                      <tr><td style="padding:6px 0;color:#8996a6">Date</td><td style="text-align:right;color:#fff">${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Kolkata'})}</td></tr>
                      <tr style="border-top:1px solid #202a36"><td style="padding:14px 0 6px;font-weight:700;font-size:16px">Total Paid</td><td style="text-align:right;font-weight:900;font-size:20px;padding:14px 0 6px;color:#55e0d0">₹${Number(course.price).toLocaleString('en-IN')}</td></tr>
                    </table>
                  </div>
                  <a href="https://jtrader.in" style="display:inline-block;background:#fff;color:#080a0d;padding:14px 28px;border-radius:10px;font-weight:900;font-size:13px;text-decoration:none;margin-bottom:24px">Start Learning →</a>
                  <p style="color:#596778;font-size:12px;margin:0">Your course is now accessible from your dashboard. Keep this email for your records.</p>
                  <hr style="border:none;border-top:1px solid #161d26;margin:24px 0"/>
                  <p style="color:#3d4d5c;font-size:10px;margin:0">JTrader Academy · jtrader.in</p>
                </div>`
              })
            }).catch(()=>{});
          }

          // Send email notification to admin
          if(resendKey){
            const courseLabel=courseId==='option-trading'?'Option Trading Course':'Basic of Share Market';
            fetch('https://api.resend.com/emails',{
              method:'POST',
              headers:{'Content-Type':'application/json','Authorization':`Bearer ${resendKey}`},
              body:JSON.stringify({
                from:'JTrader Academy <onboarding@resend.dev>',
                to:['jeyaakash8@gmail.com'],
                subject:`💰 New payment — ₹${course.price.toLocaleString('en-IN')} from ${u.name||u.email}`,
                html:`<h2>New course purchase!</h2>
                      <p><b>Student:</b> ${u.name||'—'} (${u.email})</p>
                      <p><b>Course:</b> ${courseLabel}</p>
                      <p><b>Amount:</b> ₹${Number(course.price).toLocaleString('en-IN')}</p>
                      <p><b>Payment ID:</b> ${razorpay_payment_id}</p>
                      <p><b>Time:</b> ${new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</p>`
              })
            }).catch(()=>{});
          }

          return Response.json({ok:true});
        }

        return Response.json(
          {error:'Unknown payment action'},
          {status:404}
        );
      }
    }
  }
});
