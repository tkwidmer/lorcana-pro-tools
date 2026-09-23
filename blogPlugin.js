/* global process */
// Build-time support for the markdown blog in content/blog/.
//
// 1. `transform` turns each content/blog/*.md import into a plain JS module
//    exporting the parsed post ({ slug, title, date, description, html }), so
//    the markdown is compiled at build time and the client bundle ships only
//    HTML strings (see src/lib/blog.js).
// 2. After the build, writes a real static HTML file for /blog and every
//    /blog/<slug> — the built index.html shell with per-post <head> tags
//    (title, description, canonical, Open Graph, BlogPosting JSON-LD) and the
//    post body inside #root — and appends the post URLs to dist/sitemap.xml.
//    Vercel serves these files ahead of the SPA catch-all rewrite, so crawlers
//    get full content without running JS. This deliberately does not use
//    prerender.js: that step needs Chromium, which the Vercel build image
//    doesn't have, so it's skipped in production.
import fs from 'fs'
import path from 'path'
import { parsePost } from './src/lib/blogPost.js'
import { BLOG_DESCRIPTION, formatPostDate } from './src/lib/blogMeta.js'

const SITE_URL = 'https://lorcana-pro-tools.vercel.app'
const BLOG_TITLE = 'Blog · InkbornForge'

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function replaceOnce(html, pattern, replacement) {
  const matches = html.match(new RegExp(pattern.source, 'g'))
  if (matches?.length !== 1) {
    throw new Error(`blogPlugin: expected exactly one match for ${pattern} in the target file, found ${matches?.length ?? 0}`)
  }
  return html.replace(pattern, () => replacement)
}

function metaPattern(attr, key) {
  return new RegExp(`<meta\\s+${attr}="${key}"\\s+content="[^"]*"\\s*/?>`)
}

// Rewrites the built index.html shell into a static page for one blog URL.
export function renderStaticPage(shell, { title, description, urlPath, ogType, jsonLd, bodyHtml }) {
  const url = `${SITE_URL}${urlPath}`
  const t = escapeHtml(title)
  const d = escapeHtml(description)

  let html = shell
  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${t}</title>`)
  html = replaceOnce(html, metaPattern('name', 'description'), `<meta name="description" content="${d}" />`)
  html = replaceOnce(html, /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${url}" />`)
  html = replaceOnce(html, metaPattern('property', 'og:type'), `<meta property="og:type" content="${ogType}" />`)
  html = replaceOnce(html, metaPattern('property', 'og:url'), `<meta property="og:url" content="${url}" />`)
  html = replaceOnce(html, metaPattern('property', 'og:title'), `<meta property="og:title" content="${t}" />`)
  html = replaceOnce(html, metaPattern('property', 'og:description'), `<meta property="og:description" content="${d}" />`)
  html = replaceOnce(html, metaPattern('name', 'twitter:title'), `<meta name="twitter:title" content="${t}" />`)
  html = replaceOnce(html, metaPattern('name', 'twitter:description'), `<meta name="twitter:description" content="${d}" />`)
  html = replaceOnce(
    html,
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    // Escaping `<` keeps a stray "</script>" in post text from closing the tag.
    `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`,
  )
  html = replaceOnce(html, /<div id="root"><\/div>/, `<div id="root">${bodyHtml}</div>`)
  return html
}

function indexPage(shell, posts) {
  const items = posts
    .map(
      post => `<li><a href="/blog/${post.slug}"><h2>${escapeHtml(post.title)}</h2></a>` +
        `<time datetime="${post.date}">${formatPostDate(post.date)}</time>` +
        `<p>${escapeHtml(post.description)}</p></li>`,
    )
    .join('')

  return renderStaticPage(shell, {
    title: BLOG_TITLE,
    description: BLOG_DESCRIPTION,
    urlPath: '/blog',
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: 'InkbornForge Blog',
      url: `${SITE_URL}/blog`,
      description: BLOG_DESCRIPTION,
    },
    bodyHtml: `<main class="w-full px-6 py-8"><h1>Blog</h1><ul>${items}</ul></main>`,
  })
}

function postPage(shell, post) {
  return renderStaticPage(shell, {
    title: `${post.title} · InkbornForge`,
    description: post.description,
    urlPath: `/blog/${post.slug}`,
    ogType: 'article',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.description,
      datePublished: post.date,
      url: `${SITE_URL}/blog/${post.slug}`,
      mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
      author: { '@type': 'Organization', name: 'InkbornForge', url: SITE_URL },
      publisher: { '@type': 'Organization', name: 'InkbornForge', url: SITE_URL },
    },
    bodyHtml:
      `<main class="w-full px-6 py-8"><article>` +
      `<p><a href="/blog">← All posts</a></p>` +
      `<h1>${escapeHtml(post.title)}</h1>` +
      `<time datetime="${post.date}">${formatPostDate(post.date)}</time>` +
      `<div class="blog-prose">${post.html}</div>` +
      `</article></main>`,
  })
}

export function blogPlugin() {
  const contentDir = path.resolve(process.cwd(), 'content/blog')
  let outDir
  let isBuild

  return {
    name: 'blog',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
      isBuild = config.command === 'build'
    },
    transform(code, id) {
      if (!id.startsWith(contentDir) || !id.endsWith('.md')) return null
      const post = parsePost(path.basename(id), code)
      return { code: `export default ${JSON.stringify(post)}`, map: null }
    },
    closeBundle() {
      if (!isBuild) return

      const posts = fs
        .readdirSync(contentDir)
        .filter(name => name.endsWith('.md'))
        .map(name => parsePost(name, fs.readFileSync(path.join(contentDir, name), 'utf8')))
        .sort((a, b) => b.date.localeCompare(a.date))

      const shell = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8')

      fs.mkdirSync(path.join(outDir, 'blog'), { recursive: true })
      fs.writeFileSync(path.join(outDir, 'blog', 'index.html'), indexPage(shell, posts))
      for (const post of posts) {
        fs.mkdirSync(path.join(outDir, 'blog', post.slug), { recursive: true })
        fs.writeFileSync(path.join(outDir, 'blog', post.slug, 'index.html'), postPage(shell, post))
      }

      const sitemapPath = path.join(outDir, 'sitemap.xml')
      const entries = [
        `  <url>\n    <loc>${SITE_URL}/blog</loc>\n    <priority>0.7</priority>\n  </url>`,
        ...posts.map(
          post => `  <url>\n    <loc>${SITE_URL}/blog/${post.slug}</loc>\n    <lastmod>${post.date}</lastmod>\n    <priority>0.6</priority>\n  </url>`,
        ),
      ].join('\n')
      const sitemap = replaceOnce(fs.readFileSync(sitemapPath, 'utf8'), /<\/urlset>/, `${entries}\n</urlset>`)
      fs.writeFileSync(sitemapPath, sitemap)

      console.log(`blog: wrote ${posts.length} post page(s) + index, and added them to sitemap.xml`)
    },
  }
}
