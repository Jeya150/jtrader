import {createFileRoute} from '@tanstack/react-router';
import {db,active,hasCourseAccess,user} from '../../lib/course.server';
import {bindings} from '../../lib/bindings.server';

export const Route=createFileRoute('/api/data')({
  server:{
    handlers:{
      GET:async({request})=>{

        const p=new URL(request.url).searchParams.get('type');

        if(p==='lessons'){

          const courseId=
            new URL(request.url).searchParams.get('courseId')||'';

          if(!courseId){
            return Response.json({
              expiresAt:null,
              lessons:[]
            });
          }

          const access=await hasCourseAccess(
            request,
            courseId
          );

          if(!access.allowed){
            return Response.json({
              expiresAt:null,
              lessons:[]
            });
          }

          const r=await db()
            .prepare(
              'SELECT id,title,module,description,position,video_key,course_id FROM lessons WHERE course_id=? ORDER BY position'
            )
            .bind(courseId)
            .all();

          return Response.json({
            expiresAt:access.expires,
            lessons:r.results.map((x:any)=>({
              ...x,
              video_key:undefined,
              available:!!x.video_key
            }))
          });
        }

        if(p==='community'){
          const u=await user(request);
          if(!u) return Response.json({error:'Unauthorized'},{status:401});

          if(u.role!=='admin'){
            const access=await hasCourseAccess(request,'option-trading');
            if(!access.allowed){
              return Response.json(
                {error:'Community requires Option Trading Course'},
                {status:403}
              );
            }
          }

          const r=await db()
            .prepare(
              'SELECT p.id,p.body,p.image_key,p.section,p.created_at,u.name,u.role as user_role FROM posts p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 100'
            )
            .all();

          return Response.json({posts:r.results});
        }

        if(p==='progress'){
          const u=await user(request);
          if(!u) return Response.json({error:'Unauthorized'},{status:401});
          const courseId=new URL(request.url).searchParams.get('courseId')||'';
          const r=await db()
            .prepare('SELECT lesson_id FROM lesson_progress WHERE user_id=? AND course_id=?')
            .bind(u.id,courseId)
            .all();
          return Response.json({completed:(r.results||[]).map((x:any)=>x.lesson_id)});
        }

        return Response.json(
          {error:'Unknown data type'},
          {status:404}
        );
      },

      DELETE:async({request})=>{
        const {u}=await active(request);
        if(u.role!=='admin'){
          return Response.json({error:'Admin only'},{status:403});
        }
        const d=await request.json().catch(()=>({})) as any;
        if(!d.id) return Response.json({error:'Post id required'},{status:400});
        await db().prepare('DELETE FROM posts WHERE id=?').bind(d.id).run();
        return Response.json({ok:true});
      },

      PATCH:async({request})=>{
        const u2=await user(request);
        if(!u2) return Response.json({error:'Unauthorized'},{status:401});
        const d=await request.json().catch(()=>({})) as any;
        const {lessonId,courseId}=d;
        if(!lessonId||!courseId) return Response.json({error:'lessonId and courseId required'},{status:400});
        const existing=await db()
          .prepare('SELECT id FROM lesson_progress WHERE user_id=? AND lesson_id=?')
          .bind(u2.id,lessonId).first<any>();
        if(existing){
          await db().prepare('DELETE FROM lesson_progress WHERE user_id=? AND lesson_id=?')
            .bind(u2.id,lessonId).run();
          return Response.json({ok:true,completed:false});
        }else{
          await db().prepare('INSERT INTO lesson_progress(id,user_id,lesson_id,course_id) VALUES(?,?,?,?)')
            .bind(crypto.randomUUID(),u2.id,lessonId,courseId).run();
          return Response.json({ok:true,completed:true});
        }
      },

      POST:async({request})=>{
        const {u}=await active(request);

        // Students need option-trading to post; admins always allowed
        if(u.role!=='admin'){
          const access=await hasCourseAccess(request,'option-trading');
          if(!access.allowed){
            return Response.json(
              {error:'Community requires Option Trading Course'},
              {status:403}
            );
          }
        }

        const ct=request.headers.get('Content-Type')||'';
        let body='';
        let section='student';
        let imageKey:string|null=null;

        if(ct.includes('multipart/form-data')){
          const form=await request.formData();
          body=String(form.get('body')||'').trim();
          section=String(form.get('section')||'student');
          const imageFile=form.get('image') as File|null;
          if(imageFile && imageFile.size>0){
            const env=bindings();
            if(env.STORAGE){
              const key=`community/${crypto.randomUUID()}`;
              await env.STORAGE.put(key,await imageFile.arrayBuffer(),{
                httpMetadata:{contentType:imageFile.type||'image/jpeg'}
              });
              imageKey=key;
            }
          }
        }else{
          const d=await request.json().catch(()=>({})) as any;
          body=String(d.body||'').trim();
          section=String(d.section||'student');
        }

        // Only admin can post to admin section
        if(section==='admin' && u.role!=='admin') section='student';

        if(!body && !imageKey){
          return Response.json({error:'Message or image is required'},{status:400});
        }
        if(body.length>2000){
          return Response.json({error:'Message too long (max 2000 chars)'},{status:400});
        }

        await db()
          .prepare(
            'INSERT INTO posts(id,user_id,body,image_key,section) VALUES(?,?,?,?,?)'
          )
          .bind(crypto.randomUUID(),u.id,body||'',imageKey,section)
          .run();

        return Response.json({ok:true});
      }
    }
  }
});
