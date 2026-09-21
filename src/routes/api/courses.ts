import {createFileRoute} from '@tanstack/react-router';
import {db} from '../../lib/course.server';

export const Route=createFileRoute('/api/courses')({
  server:{
    handlers:{
      GET:async()=>{
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
