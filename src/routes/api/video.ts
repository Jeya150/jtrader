import {createFileRoute} from '@tanstack/react-router';
import {db,hasCourseAccess} from '../../lib/course.server';
import {bindings} from '../../lib/bindings.server';
import type {R2ObjectBody} from '@cloudflare/workers-types';

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

        const store=bindings().STORAGE;

        /*
         * Honour Range so the player can seek. Without it the browser has
         * to pull the file from the start every time, so scrubbing through
         * a long lesson restarts playback instead of jumping.
         */
        const wants=request.headers.get('Range');

        /*
         * R2 parses the Range header itself. The cast is only to bridge the
         * DOM Headers type against the workers-types one.
         */
        const o=await store
          ?.get(
            l.video_key,
            wants?{range:request.headers as any}:undefined
          )
          .catch(()=>null) as R2ObjectBody|null|undefined;

        if(!o){
          /*
           * A range past the end of the object fails the get even though
           * the video is fine — tell the player that rather than 404.
           */
          if(wants){
            const head=await store?.head(l.video_key);

            if(head){
              return new Response(
                'Range not satisfiable',
                {
                  status:416,
                  headers:{
                    'Content-Range':`bytes */${head.size}`
                  }
                }
              );
            }
          }

          return new Response(
            'Video not found',
            {status:404}
          );
        }

        const headers:Record<string,string>={
          'Content-Type':
            o.httpMetadata?.contentType ||
            'video/mp4',
          'Cache-Control':
            'private,no-store',
          'Accept-Ranges':'bytes'
        };

        if(wants && o.range){
          const r=o.range as any;

          const offset=
            typeof r.suffix==='number'
              ? o.size-r.suffix
              : r.offset ?? 0;

          const length=
            typeof r.suffix==='number'
              ? r.suffix
              : r.length ?? o.size-offset;

          headers['Content-Range']=
            `bytes ${offset}-${offset+length-1}/${o.size}`;

          headers['Content-Length']=String(length);

          return new Response(
            o.body as any,
            {status:206,headers}
          );
        }

        headers['Content-Length']=String(o.size);

        return new Response(
          o.body as any,
          {headers}
        );
      }
    }
  }
});
