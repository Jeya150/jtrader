import {createFileRoute} from '@tanstack/react-router';
import {db} from '../../lib/course.server';

export const Route=createFileRoute('/api/social-proof')({
  server:{
    handlers:{
      GET:async()=>{
        const rows=await db()
          .prepare(`
            SELECT
              u.name,
              u.city,
              c.title  AS course_title,
              e.starts_at
            FROM entitlements e
            JOIN users u  ON u.id  = e.user_id
            JOIN courses c ON c.id = e.course_id
            WHERE e.starts_at IS NOT NULL
            ORDER BY e.starts_at DESC
            LIMIT 25
          `)
          .all<any>();

        const items=(rows.results||[]).map((r:any)=>({
          // Only first name for privacy
          name: (r.name||'Student').split(' ')[0],
          city: r.city||'Tamil Nadu',
          course: r.course_title||'Course',
          starts_at: r.starts_at,
        }));

        return Response.json({ok:true,items},{
          headers:{'Cache-Control':'public, max-age=120'},
        });
      }
    }
  }
});
