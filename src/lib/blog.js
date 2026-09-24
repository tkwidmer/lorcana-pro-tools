// Client access to the markdown blog posts in content/blog/. Each .md file is
// compiled to { slug, title, date, description, html } at build time by
// blogPlugin.js, so no markdown parsing happens in the browser. Drafts compile
// to null in production builds (and are dropped here); in dev they're kept so
// they can be previewed, flagged with `draft: true`.
const modules = import.meta.glob('/content/blog/*.md', { eager: true, import: 'default' })

const POSTS = Object.values(modules).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date))

// Newest first.
export function listPosts() {
  return POSTS
}

export function getPost(slug) {
  return POSTS.find(post => post.slug === slug)
}
