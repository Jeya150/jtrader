import { createFileRoute } from '@tanstack/react-router';
import { AwsClient } from 'aws4fetch';
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
 * Presigned direct-to-R2 upload.
 *
 * jtrader.in sits behind a gateway that rejects any request body over
 * 102400 bytes (100KiB) with a 413 before it ever reaches this Worker —
 * confirmed by probing the live endpoint. That is far below R2's 5MiB
 * multipart-part minimum, so no chunk size posted through the Worker can
 * ever get a video here.
 *
 * So the video never touches this Worker at all: the browser PUTs the file
 * straight to R2's S3-compatible endpoint using a short-lived presigned
 * URL, which this route only generates. That request goes to
 * accountid.r2.cloudflarestorage.com, not jtrader.in, so the gateway's body
 * cap never applies to it.
 */

// R2's S3-compatible API caps a single (non-multipart) PUT at 5GiB —
// this is the real ceiling, not an arbitrary app-level choice.
const MAX_BYTES = 5 * 1024 * 1024 * 1024;

const PREFIX = 'course/video/';

const bad = (error: string, status = 400) =>
  Response.json({ error }, { status });

const safeKey = (key: string) =>
  key.startsWith(PREFIX) && !key.includes('..');

export const Route = createFileRoute('/api/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await guard(request);

        const url = new URL(request.url);
        const action = url.searchParams.get('action') || '';
        const env = bindings();

        if (action === 'presign') {
          const d: any = await request.json().catch(() => ({}));
          const contentType = String(d.contentType || '');
          const size = Number(d.size || 0);

          if (!contentType.startsWith('video/')) {
            return bad('Video file required');
          }

          if (!size || size > MAX_BYTES) {
            return bad('Video must be 5GB or smaller');
          }

          if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
            return bad('Direct upload is not configured', 500);
          }

          const key = `${PREFIX}${crypto.randomUUID()}`;

          const client = new AwsClient({
            accessKeyId: env.R2_ACCESS_KEY_ID,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY,
            service: 's3',
            region: 'auto',
          });

          const objectUrl = new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/jtrader-storage/${key}`);
          // A 5GB file on a slow connection can take hours; give the
          // presigned URL enough headroom that it doesn't expire mid-upload.
          objectUrl.searchParams.set('X-Amz-Expires', '43200');

          // signQuery produces a presigned URL (auth in the query string)
          // rather than a signed Authorization header, which is what a
          // browser PUT from plain fetch/XHR needs — it can't attach R2's
          // SigV4 header itself.
          const signed = await client.sign(
            new Request(objectUrl, {
              method: 'PUT',
              headers: { 'Content-Type': contentType },
            }),
            { aws: { signQuery: true } }
          );

          return Response.json({ key, uploadUrl: signed.url });
        }

        /*
         * The uploaded object has no metadata (owner, lesson) until the
         * lesson is actually saved, so a video that never gets attached
         * would sit in the bucket forever otherwise. Let the admin UI
         * clean it up if the user cancels or the save fails.
         */
        if (action === 'discard') {
          const d: any = await request.json().catch(() => ({}));
          const key = String(d.key || '');

          if (!safeKey(key)) return bad('Invalid key');

          await bindings().STORAGE?.delete(key).catch(() => {});
          return Response.json({ ok: true });
        }

        return bad('Unknown action');
      },
    },
  },
});
