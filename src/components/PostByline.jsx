import { AUTHOR_LINK_REL, formatPostDate } from '../lib/blogMeta'
import { Badge } from './ui/Badge'

// "By <author> · <date>" for a blog post. The author links out to their
// X/Twitter, Metafy, or other profile (authorUrl in the post's frontmatter).
export function PostByline({ post, className = '' }) {
  return (
    <p className={`text-sm text-gray-500 ${className}`}>
      {post.draft && (
        <Badge tone="neutral" className="mr-2">Draft</Badge>
      )}
      By{' '}
      <a
        href={post.authorUrl}
        rel={AUTHOR_LINK_REL}
        target="_blank"
        className="text-gray-700 hover:text-gray-900 hover:underline"
      >
        {post.author}
      </a>
      {' · '}
      <time dateTime={post.date}>{formatPostDate(post.date)}</time>
    </p>
  )
}
