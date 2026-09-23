// Client access to the markdown blog posts in content/blog/. Each .md file is
// compiled to { slug, title, date, description, html } at build time by
// blogPlugin.js, so no markdown parsing happens in the browser.
const modules = import.meta.glob('/content/blog/*.md', { eager: true, import: 'default' })

const POSTS = Object.values(modules).sort((a, b) => b.date.localeCompare(a.date))

// Newest first.
export function listPosts() {
  return POSTS
}

export function getPost(slug) {
  return POSTS.find(post => post.slug === slug)
}
