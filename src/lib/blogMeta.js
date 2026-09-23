// Blog constants/helpers shared by the client and blogPlugin.js's build-time
// static pages. Kept apart from blogPost.js (which pulls in `marked`) and
// blog.js (which uses import.meta.glob) so both environments can import it.

export const BLOG_DESCRIPTION =
  'Articles on competitive Disney Lorcana from InkbornForge — strategy, meta analysis, and updates on the tools.'

// rel="author" marks the link as the post author's profile for crawlers.
export const AUTHOR_LINK_REL = 'author noopener noreferrer'

// Formats a post's YYYY-MM-DD date for display. UTC so the static HTML and the
// client render the same calendar day regardless of the viewer's (or build
// machine's) timezone.
export function formatPostDate(date) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
