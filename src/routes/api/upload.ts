import { createFileRoute } from '@tanstack/react-router';
import { user } from '../../lib/course.server';
import { bindings } from '../../lib/bindings.server';
import { ADMIN_EMAIL } from '../../lib/config.server';

const guard = async (r: Request) => {
  const u = await user(r);
  if (!u || u.role !== 'admin' || u.email !== ADMIN_EMAIL) {
    throw new Response('Forbidden', { status: 403 });
  }
};

/*
 * Chunked video upload.
 *
 * Posting a whole video to /api/admin sends it through the Worker in one
 * request, which Cloudflare rejects with 413 once the body passes the plan
 * limit (100MB on free/pro) — and even under that it would buffer the file
 * into the Worker's 128MB of memory.
 *
 * So the browser slices the file and sends one part per request against R2's
 * multipart API instead. Every request stays small, and the client knows how
 * many bytes have landed, which is what drives the progress bar.
 */

// R2 requires every part except the last to be the same size and at least
// 5MiB. 10MiB keeps each request far below the body cap while staying well
// inside the 10,000-part ceiling.
const PART_SIZE = 10 * 1024 * 1024;

const MAX_BYTES = 500 * 1024 * 1024;

const PREFIX = 'course/video/';

const bad = (error: string, status = 400) =>
  Response.json({ error }, { status });

const bucket = () => {
  const store = bindings().STORAGE;
  if (!store) throw new Response('Storage unavailable', { status: 500 });
  return store;
};

/*
 * A key only ever comes back from the 'create' step, but it arrives from the
 * client on every later step, so re-check it rather than trusting the round
 * trip to write somewhere else in the bucket.
 */
const safeKey = (key: string) =>
  key.startsWith(PREFIX) && !key.includes('..');

export const Route = createFileRoute('/api/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await guard(request);

        const url = new URL(request.url);
        const action = url.searchParams.get('action') || '';
        const store = bucket();

        /*
         * START — reserve a key and open the multipart upload.
         */
        if (action === 'create') {
          const d: any = await request.json().catch(() => ({}));
          const contentType = String(d.contentType || '');
          const size = Number(d.size || 0);

          if (!contentType.startsWith('video/')) {
            return bad('Video file required');
          }

          if (!size || size > MAX_BYTES) {
            return bad('Video must be 500MB or smaller');
          }

          const key = `${PREFIX}${crypto.randomUUID()}`;

          const upload = await store.createMultipartUpload(key, {
            httpMetadata: { contentType },
          });

          return Response.json({
            key,
            uploadId: upload.uploadId,
            partSize: PART_SIZE,
          });
        }

        /*
         * PART — the raw chunk is the request body.
         */
        if (action === 'part') {
          const key = url.searchParams.get('key') || '';
          const uploadId = url.searchParams.get('uploadId') || '';
          const partNumber = Number(url.searchParams.get('part') || 0);

          if (!safeKey(key) || !uploadId || partNumber < 1) {
            return bad('Invalid upload part');
          }

          const body = await request.arrayBuffer();
          if (!body.byteLength) return bad('Empty upload part');

          const part = await store
            .resumeMultipartUpload(key, uploadId)
            .uploadPart(partNumber, body);

          return Response.json({
            partNumber: part.partNumber,
            etag: part.etag,
          });
        }

        /*
         * FINISH — stitch the parts into a single object.
         */
        if (action === 'complete') {
          const d: any = await request.json().catch(() => ({}));
          const key = String(d.key || '');
          const uploadId = String(d.uploadId || '');
          const parts = Array.isArray(d.parts) ? d.parts : [];

          if (!safeKey(key) || !uploadId || !parts.length) {
            return bad('Invalid upload');
          }

          await store
            .resumeMultipartUpload(key, uploadId)
            .complete(
              parts.map((p: any) => ({
                partNumber: Number(p.partNumber),
                etag: String(p.etag),
              }))
            );

          return Response.json({ key });
        }

        /*
         * ABORT — called when the browser gives up, so half-written parts
         * are not left billing against the bucket.
         */
        if (action === 'abort') {
          const d: any = await request.json().catch(() => ({}));
          const key = String(d.key || '');
          const uploadId = String(d.uploadId || '');

          if (!safeKey(key) || !uploadId) return bad('Invalid upload');

          await store
            .resumeMultipartUpload(key, uploadId)
            .abort()
            .catch(() => {});

          return Response.json({ ok: true });
        }

        return bad('Unknown action');
      },
    },
  },
});
