// Parses one markdown blog post (content/blog/<slug>.md) into the shape the
// blog pages and the build-time static HTML both consume. Runs only at build
// time, inside blogPlugin.js — the client imports the already-parsed result,
// so `marked` never ships in the browser bundle.
//
// Post format:
//
//   ---
//   title: My post
//   date: 2026-09-23
//   description: One-sentence summary used for the index, meta description, and social cards.
//   author: Jane Doe
//   authorUrl: https://x.com/janedoe
//   ---
//
// authorUrl is the author's X/Twitter, Metafy, or other profile link — posts
// can be guest-written, so every post names and links its own author.
//
//   Markdown body…
import { marked } from 'marked'

const REQUIRED_FIELDS = ['title', 'date', 'description', 'author', 'authorUrl']
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function parseFrontmatter(filename, raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) throw new Error(`${filename}: missing --- frontmatter block`)

  const fields = {}
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue
    const sep = line.indexOf(':')
    if (sep === -1) throw new Error(`${filename}: bad frontmatter line "${line}"`)
    fields[line.slice(0, sep).trim()] = line.slice(sep + 1).trim()
  }

  for (const field of REQUIRED_FIELDS) {
    if (!fields[field]) throw new Error(`${filename}: frontmatter is missing "${field}"`)
  }
  if (!DATE_PATTERN.test(fields.date)) {
    throw new Error(`${filename}: date must be YYYY-MM-DD, got "${fields.date}"`)
  }
  if (!fields.authorUrl.startsWith('https://')) {
    throw new Error(`${filename}: authorUrl must be an https:// link, got "${fields.authorUrl}"`)
  }

  return { fields, body: match[2] }
}

export function parsePost(filename, raw) {
  const slug = filename.replace(/\.md$/, '')
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`${filename}: filename must be a lowercase-hyphenated slug`)
  }

  const { fields, body } = parseFrontmatter(filename, raw)
  return {
    slug,
    title: fields.title,
    date: fields.date,
    description: fields.description,
    author: fields.author,
    authorUrl: fields.authorUrl,
    html: marked.parse(body),
  }
}

