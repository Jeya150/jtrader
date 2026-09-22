import { createFileRoute } from '@tanstack/react-router';
import { db, user } from '../../lib/course.server';
import { bindings } from '../../lib/bindings.server';
import { ADMIN_EMAIL } from '../../lib/config.server';

const guard = async (r: Request) => {
  const u = await user(r);
  if (!u || u.role !== 'admin' || u.email !== ADMIN_EMAIL) {
    throw new Response('Forbidden', { status: 403 });
  }
};

export const Route = createFileRoute('/api/admin')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await guard(request);

        const students = await db()
          .prepare(
            `SELECT
              u.id,
              u.name,
              u.email,
              u.city,
              u.blocked,
              u.created_at,
              COALESCE(
                (
                  SELECT amount
                  FROM payments p
                  WHERE p.user_id = u.id
                    AND p.status = 'paid'
                  ORDER BY p.rowid DESC
                  LIMIT 1
                ),
                0
              ) amount,
              CASE
                WHEN EXISTS(
                  SELECT 1
                  FROM payments p
                  WHERE p.user_id = u.id
                    AND p.status = 'paid'
                )
                THEN 'Paid'
                ELSE 'Pending'
              END status
            FROM users u
            WHERE u.role = 'student'
            ORDER BY u.created_at DESC`
          // also select id and blocked
          )
          .all();

        const lessons = await db()
          .prepare(
            `SELECT
              id,
              course_id,
              title,
              module,
              description,
              position,
              video_key
            FROM lessons
            ORDER BY course_id, position`
          )
          .all();

        const settings = await db()
          .prepare('SELECT * FROM course_settings WHERE id=1')
          .first<any>();

        const courses = await db()
          .prepare(
            `SELECT
              id,
              title,
              price,
              old_price,
              access,
              description,
              thumbnail_key,
              status,
              created_at
            FROM courses
            ORDER BY id`
          )
          .all();

        // Progress per student per course
        const progress = await db()
          .prepare(
            `SELECT
              lp.user_id,
              lp.course_id,
              COUNT(lp.id) as completed
            FROM lesson_progress lp
            GROUP BY lp.user_id, lp.course_id`
          )
          .all();

        const broadcast = await db().prepare('SELECT message,created_at FROM broadcasts ORDER BY rowid DESC LIMIT 1').first<any>();

        return Response.json({
          students: students.results,

          courses: courses.results,

          lessons: lessons.results.map((x: any) => ({
            ...x,
            available: !!x.video_key,
            video_key: undefined,
          })),

          settings,
          progress: progress.results,
          broadcast: broadcast || null,
        });
      },

      POST: async ({ request }) => {
        await guard(request);

        const ct = request.headers.get('content-type') || '';

        let d: any = {};
        let fd: FormData | undefined;

        if (ct.includes('multipart/form-data')) {
          fd = await request.formData();

          for (const k of [
            'action',
            'id',
            'courseId',
            'title',
            'module',
            'description',
            'position',
            'price',
            'oldPrice',
            'access',
            'videoKey',
          ]) {
            d[k] = String(fd.get(k) || '');
          }
        } else {
          d = await request.json().catch(() => ({}));
        }

        const store = bindings().STORAGE;

        /*
         * UPDATE COURSE
         *
         * Allows admin to change:
         * - title
         * - price
         * - old price
         * - access duration
         * - description
         */
        if (d.action === 'student-toggle-block') {
          if (!d.userId) return Response.json({ error: 'User ID required' }, { status: 400 });
          await db()
            .prepare('UPDATE users SET blocked = CASE WHEN blocked=1 THEN 0 ELSE 1 END WHERE id=? AND role=?')
            .bind(d.userId, 'student').run();
          // Clear sessions if blocking
          const u2 = await db().prepare('SELECT blocked FROM users WHERE id=?').bind(d.userId).first<any>();
          if (u2?.blocked) {
            await db().prepare('DELETE FROM sessions WHERE user_id=?').bind(d.userId).run();
          }
          return Response.json({ ok: true, blocked: !!u2?.blocked });
        }

        if (d.action === 'broadcast') {
          const msg = String(d.message || '').trim();
          if (!msg) return Response.json({ error: 'Message required' }, { status: 400 });
          // Keep only latest broadcast
          await db().prepare('DELETE FROM broadcasts').run();
          await db().prepare('INSERT INTO broadcasts(id,message) VALUES(?,?)').bind(crypto.randomUUID(), msg).run();

          // Email all students if Resend key available
          const { bindings: getBindings } = await import('../../lib/bindings.server');
          const resendKey = (getBindings() as any).RESEND_API_KEY;
          if (resendKey) {
            const students = await db().prepare("SELECT email,name FROM users WHERE role='student' AND blocked=0").all();
            const emails = (students.results || []) as any[];
            for (const s of emails.slice(0, 50)) { // batch max 50
              fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
                body: JSON.stringify({
                  from: 'JTrader Academy <onboarding@resend.dev>',
                  to: [s.email],
                  subject: '📢 Message from JTrader Academy',
                  html: `<div style="font-family:sans-serif;max-width:560px;margin:auto;background:#07090d;color:#f4f7fb;padding:32px;border-radius:16px"><h2 style="margin:0 0 16px">Message from JTrader Academy</h2><p style="color:#c8d3de;line-height:1.8;font-size:15px">${msg.replace(/\n/g,'<br/>')}</p><hr style="border:none;border-top:1px solid #161d26;margin:24px 0"/><a href="https://jtrader.in" style="display:inline-block;background:#fff;color:#080a0d;padding:12px 24px;border-radius:8px;font-weight:900;font-size:12px;text-decoration:none">Open Dashboard →</a></div>`
                })
              }).catch(() => {});
            }
          }
          return Response.json({ ok: true });
        }

        if (d.action === 'broadcast-clear') {
          await db().prepare('DELETE FROM broadcasts').run();
          return Response.json({ ok: true });
        }

        if (d.action === 'course-set-status') {
          if (!d.courseId || !d.status) return Response.json({ error: 'courseId and status required' }, { status: 400 });
          if (!['active','coming_soon','hidden'].includes(d.status)) return Response.json({ error: 'Invalid status' }, { status: 400 });
          await db().prepare('UPDATE courses SET status=? WHERE id=?').bind(d.status, d.courseId).run();
          return Response.json({ ok: true, status: d.status });
        }

        if (d.action === 'course-update') {
          if (!d.courseId) {
            return Response.json(
              { error: 'Course ID required' },
              { status: 400 }
            );
          }

          await db()
            .prepare(
              `UPDATE courses
               SET title=?,
                   price=?,
                   old_price=?,
                   access=?,
                   description=?
               WHERE id=?`
            )
            .bind(
              d.title,
              Number(d.price || 0),
              Number(d.oldPrice || 0),
              d.access || '6 months',
              d.description || '',
              d.courseId
            )
            .run();

          return Response.json({
            ok: true,
            course: await db()
              .prepare('SELECT * FROM courses WHERE id=?')
              .bind(d.courseId)
              .first(),
          });
        }

        /*
         * COURSE THUMBNAIL
         */
        if (d.action === 'course-thumbnail') {
          if (!d.courseId) {
            return Response.json(
              { error: 'Course ID required' },
              { status: 400 }
            );
          }

          const f = fd?.get('thumbnail');

          if (!(f instanceof File) || !f.size) {
            return Response.json(
              { error: 'Thumbnail required' },
              { status: 400 }
            );
          }

          if (!store) {
            return Response.json(
              { error: 'Storage unavailable' },
              { status: 500 }
            );
          }

          if (!f.type.startsWith('image/')) {
            return Response.json(
              { error: 'Thumbnail must be an image' },
              { status: 400 }
            );
          }

          const old = await db()
            .prepare(
              'SELECT thumbnail_key FROM courses WHERE id=?'
            )
            .bind(d.courseId)
            .first<any>();

          const key = `course/thumbnail/${crypto.randomUUID()}`;

          await store.put(key, await f.arrayBuffer(), {
            httpMetadata: {
              contentType: f.type,
            },
          });

          await db()
            .prepare(
              'UPDATE courses SET thumbnail_key=? WHERE id=?'
            )
            .bind(key, d.courseId)
            .run();

          if (old?.thumbnail_key) {
            await store.delete(old.thumbnail_key);
          }

          return Response.json({
            ok: true,
          });
        }

        /*
         * OLD SETTINGS SUPPORT
         */
        if (d.action === 'settings') {
          let key = '';

          const old = await db()
            .prepare(
              'SELECT thumbnail_key FROM course_settings WHERE id=1'
            )
            .first<any>();

          key = old?.thumbnail_key || '';

          const f = fd?.get('thumbnail');

          if (f instanceof File && f.size) {
            if (!store) {
              return Response.json(
                { error: 'Storage unavailable' },
                { status: 500 }
              );
            }

            if (!f.type.startsWith('image/')) {
              return Response.json(
                { error: 'Thumbnail must be an image' },
                { status: 400 }
              );
            }

            key = `course/thumbnail/${crypto.randomUUID()}`;

            await store.put(key, await f.arrayBuffer(), {
              httpMetadata: {
                contentType: f.type,
              },
            });
          }

          await db()
            .prepare(
              `INSERT INTO course_settings
              (id,title,price,old_price,access,description,thumbnail_key)
              VALUES(1,?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET
                title=excluded.title,
                price=excluded.price,
                old_price=excluded.old_price,
                access=excluded.access,
                description=excluded.description,
                thumbnail_key=
                  CASE
                    WHEN excluded.thumbnail_key=''
                    THEN course_settings.thumbnail_key
                    ELSE excluded.thumbnail_key
                  END`
            )
            .bind(
              d.title || 'JTrader Core Course',
              Number(d.price || 499),
              Number(d.oldPrice || 999),
              d.access || '6 months',
              d.description || '',
              key
            )
            .run();

          return Response.json({
            ok: true,
            settings: await db()
              .prepare(
                'SELECT * FROM course_settings WHERE id=1'
              )
              .first(),
          });
        }

        /*
         * DELETE LESSON + VIDEO
         */
        if (d.action === 'lesson-delete') {
          if (!d.id) {
            return Response.json(
              { error: 'Lesson ID required' },
              { status: 400 }
            );
          }

          const old = await db()
            .prepare(
              'SELECT video_key FROM lessons WHERE id=?'
            )
            .bind(d.id)
            .first<any>();

          await db()
            .prepare('DELETE FROM lessons WHERE id=?')
            .bind(d.id)
            .run();

          if (old?.video_key && store) {
            await store.delete(old.video_key);
          }

          return Response.json({
            ok: true,
          });
        }

        /*
         * CREATE / UPDATE LESSON
         *
         * One course can have UNLIMITED lessons/videos.
         */
        if (
          d.action === 'lesson-create' ||
          d.action === 'lesson-update'
        ) {
          if (!d.courseId) {
            return Response.json(
              { error: 'Course ID required' },
              { status: 400 }
            );
          }

          const course = await db()
            .prepare('SELECT id FROM courses WHERE id=?')
            .bind(d.courseId)
            .first();

          if (!course) {
            return Response.json(
              { error: 'Course not found' },
              { status: 400 }
            );
          }

          if (!d.title) {
            return Response.json(
              { error: 'Lesson title required' },
              { status: 400 }
            );
          }

          const old = d.id
            ? await db()
                .prepare(
                  'SELECT video_key FROM lessons WHERE id=? AND course_id=?'
                )
                .bind(d.id, d.courseId)
                .first<any>()
            : null;

          if (d.action === 'lesson-update' && !old) {
            return Response.json(
              { error: 'Lesson not found for this course' },
              { status: 404 }
            );
          }

          let key = old?.video_key || '';

          const f = fd?.get('video');

          const uploaded = String(d.videoKey || '');

          /*
           * Video already in R2 via /api/upload.
           *
           * This is the path the admin dashboard takes: the browser streams
           * the file straight into the bucket in parts, so all that arrives
           * here is the finished key.
           */
          if (uploaded) {
            if (!uploaded.startsWith('course/video/')) {
              return Response.json(
                { error: 'Invalid video reference' },
                { status: 400 }
              );
            }

            key = uploaded;

            /*
             * Delete old video when replacing it
             */
            if (old?.video_key && old.video_key !== key) {
              await store?.delete(old.video_key);
            }
          } else if (f instanceof File && f.size) {
            if (!store) {
              return Response.json(
                { error: 'Storage unavailable' },
                { status: 500 }
              );
            }

            if (!f.type.startsWith('video/')) {
              return Response.json(
                { error: 'Video file required' },
                { status: 400 }
              );
            }

            if (f.size > 5 * 1024 * 1024 * 1024) {
              return Response.json(
                {
                  error:
                    'Video must be 5GB or smaller',
                },
                { status: 400 }
              );
            }

            key = `course/video/${crypto.randomUUID()}`;

            await store.put(
              key,
              await f.arrayBuffer(),
              {
                httpMetadata: {
                  contentType: f.type,
                },
              }
            );

            /*
             * Delete old video when replacing it
             */
            if (old?.video_key) {
              await store.delete(old.video_key);
            }
          }

          /*
           * CREATE NEW LESSON
           */
          const dur = d.duration ? Number(d.duration) : null;

          if (d.action === 'lesson-create') {
            await db()
              .prepare(
                `INSERT INTO lessons
                (id,course_id,title,module,position,description,video_key,duration)
                VALUES(?,?,?,?,?,?,?,?)`
              )
              .bind(
                crypto.randomUUID(),
                d.courseId,
                d.title,
                d.module || '',
                Number(d.position || 1),
                d.description || '',
                key || null,
                dur
              )
              .run();
          }

          /*
           * UPDATE EXISTING LESSON
           */
          else {
            await db()
              .prepare(
                `UPDATE lessons
                 SET course_id=?,
                     title=?,
                     module=?,
                     position=?,
                     description=?,
                     video_key=?,
                     duration=COALESCE(?,duration)
                 WHERE id=?`
              )
              .bind(
                d.courseId,
                d.title,
                d.module || '',
                Number(d.position || 1),
                d.description || '',
                key || null,
                dur,
                d.id
              )
              .run();
          }

          return Response.json({
            ok: true,
          });
        }

        return Response.json(
          {
            error: 'Unknown action',
          },
          {
            status: 400,
          }
        );
      },
    },
  },
});