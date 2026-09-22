import {createFileRoute} from '@tanstack/react-router';
import {db} from '../../lib/course.server';

export const Route=createFileRoute('/api/courses')({
  server:{
    handlers:{
      GET:async({request})=>{
        const url=new URL(request.url);
        const curriculumId=url.searchParams.get('curriculum');

        // Public curriculum preview — titles only, no video keys
        if(curriculumId){
          const rows=await db()
            .prepare(`SELECT id,title,module,position FROM lessons WHERE course_id=? ORDER BY position`)
            .bind(curriculumId).all();
          return Response.json({ok:true,lessons:rows.results||[]});
        }

        const rows=await db()
          .prepare(`
            SELECT id,title,price,old_price,access,description,thumbnail_key,status
            FROM courses
            WHERE status != 'hidden'
            ORDER BY id
          `)
          .all();

        return Response.json({
          ok:true,
          courses:rows.results||[]
        });
      }
    }
  }
});
