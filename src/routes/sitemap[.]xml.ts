import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin
        const today = new Date().toISOString().split('T')[0]
        const urls = [
          {loc:'/',priority:'1.0',freq:'daily'},
          {loc:'/admin',priority:'0.3',freq:'monthly'},
        ];
        const xml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...urls.map(u => [
            '  <url>',
            `    <loc>${origin}${u.loc}</loc>`,
            `    <lastmod>${today}</lastmod>`,
            `    <changefreq>${u.freq}</changefreq>`,
            `    <priority>${u.priority}</priority>`,
            '  </url>',
          ].join('\n')),
          '</urlset>',
        ].join('\n')
        return new Response(xml, {
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      },
    },
  },
})
