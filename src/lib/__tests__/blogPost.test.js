import { describe, it, expect } from 'vitest'
import { parsePost } from '../blogPost'
import { formatPostDate } from '../blogMeta'
import { renderStaticPage } from '../../../blogPlugin'

const POST = `---
title: Hello: World
date: 2026-09-23
description: A short summary.
author: Jane Doe
authorUrl: https://x.com/janedoe
---

Some **bold** text.
`

describe('parsePost', () => {
  it('parses frontmatter and compiles the markdown body', () => {
    const post = parsePost('hello-world.md', POST)
    expect(post).toMatchObject({
      slug: 'hello-world',
      title: 'Hello: World',
      date: '2026-09-23',
      description: 'A short summary.',
      author: 'Jane Doe',
      authorUrl: 'https://x.com/janedoe',
    })
    expect(post.html).toContain('<strong>bold</strong>')
  })

  it('throws when frontmatter is missing', () => {
    expect(() => parsePost('a.md', 'just text')).toThrow(/frontmatter/)
  })

  it('throws when a required field is missing', () => {
    expect(() => parsePost('a.md', '---\ntitle: T\ndate: 2026-01-01\n---\nbody')).toThrow(/description/)
  })

  it('throws on a malformed date', () => {
    expect(() => parsePost('a.md', POST.replace('2026-09-23', 'Jan 1'))).toThrow(/YYYY-MM-DD/)
  })

  it('throws when the author or their link is missing', () => {
    expect(() => parsePost('a.md', POST.replace('author: Jane Doe\n', ''))).toThrow(/"author"/)
    expect(() => parsePost('a.md', POST.replace('authorUrl: https://x.com/janedoe\n', ''))).toThrow(/"authorUrl"/)
  })

  it('flags drafts, and rejects any draft value other than true', () => {
    expect(parsePost('a.md', POST).draft).toBe(false)
    expect(parsePost('a.md', POST.replace('---\n\n', 'draft: true\n---\n\n')).draft).toBe(true)
    expect(() => parsePost('a.md', POST.replace('---\n\n', 'draft: yes\n---\n\n'))).toThrow(/draft/)
  })

  it('throws when authorUrl is not an https link', () => {
    expect(() => parsePost('a.md', POST.replace('https://x.com/janedoe', 'x.com/janedoe'))).toThrow(/https/)
  })

  it('throws on a filename that is not a slug', () => {
    expect(() => parsePost('Hello World.md', POST)).toThrow(/slug/)
  })
})

describe('formatPostDate', () => {
  it('formats in UTC so the day never shifts', () => {
    expect(formatPostDate('2026-01-01')).toBe('January 1, 2026')
  })
})

describe('renderStaticPage', () => {
  const SHELL = `<head>
    <title>Old</title>
    <meta
      name="description"
      content="old"
    />
    <link rel="canonical" href="https://lorcana-pro-tools.vercel.app/" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://lorcana-pro-tools.vercel.app/" />
    <meta property="og:title" content="Old" />
    <meta
      property="og:description"
      content="old"
    />
    <meta name="twitter:title" content="Old" />
    <meta
      name="twitter:description"
      content="old"
    />
    <script type="application/ld+json">
      { "@type": "WebApplication" }
    </script>
  </head><body><div id="root"></div></body>`

  it('replaces the head tags and fills #root', () => {
    const html = renderStaticPage(SHELL, {
      title: 'A "quoted" <title>',
      description: 'Desc & more',
      urlPath: '/blog/a',
      ogType: 'article',
      jsonLd: { '@type': 'BlogPosting', headline: '</script>' },
      bodyHtml: '<article>Body</article>',
    })
    expect(html).toContain('<title>A &quot;quoted&quot; &lt;title&gt;</title>')
    expect(html).toContain('<meta name="description" content="Desc &amp; more" />')
    expect(html).toContain('<link rel="canonical" href="https://lorcana-pro-tools.vercel.app/blog/a" />')
    expect(html).toContain('<meta property="og:type" content="article" />')
    expect(html).toContain('"@type":"BlogPosting"')
    expect(html).not.toContain('WebApplication')
    expect(html).not.toMatch(/<\/script>"/)
    expect(html).toContain('<div id="root"><article>Body</article></div>')
  })

  it('throws when the shell is missing an expected tag', () => {
    expect(() => renderStaticPage('<html></html>', {
      title: 't', description: 'd', urlPath: '/blog', ogType: 'website', jsonLd: {}, bodyHtml: '',
    })).toThrow(/expected exactly one match/)
  })
})
