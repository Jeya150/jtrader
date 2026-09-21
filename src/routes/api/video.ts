import {createFileRoute} from '@tanstack/react-router';
import {db,hasCourseAccess} from '../../lib/course.server';
import {bindings} from '../../lib/bindings.server';

export const Route=createFileRoute('/api/video')({
  server:{
    handlers:{
      GET:async({request})=>{

        const id=
          new URL(request.url)
            .searchParams
            .get('lesson');

        if(!id){
          return new Response(
            'Missing lesson',
            {status:400}
          );
        }

        const l=await db()
          .prepare(
            'SELECT video_key,course_id FROM lessons WHERE id=?'
          )
          .bind(id)
          .first<any>();

        if(!l?.video_key){
          return new Response(
            'Video not found',
            {status:404}
          );
        }

        const access=
          await hasCourseAccess(
            request,
            l.course_id
          );

        if(!access.allowed){
          return new Response(
            'Course not purchased',
            {status:403}
          );
        }

        const o=
          await bindings()
            .STORAGE
            ?.get(l.video_key);

        if(!o){
          return new Response(
            'Video not found',
            {status:404}
          );
        }

        return new Response(
          o.body as any,
          {
            headers:{
              'Content-Type':
                o.httpMetadata?.contentType ||
                'video/mp4',
              'Cache-Control':
                'private,no-store'
            }
          }
        );
      }
    }
  }
});
