import { Link, useParams } from 'react-router-dom'
import { getPost } from '../lib/blog'
import { PostByline } from '../components/PostByline'

export function BlogPostPage() {
  const { slug } = useParams()
  const post = getPost(slug)

  if (!post) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Post not found</h1>
        <Link to="/blog" className="text-sm text-gray-500 hover:text-gray-900">
          ← All posts
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full px-6 py-8">
      <article className="max-w-3xl mx-auto">
        <Link to="/blog" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
          ← All posts
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mt-4">{post.title}</h1>
        <PostByline post={post} className="mt-2 mb-8" />
        {/* Compiled from the repo's own markdown at build time — trusted content. */}
        <div className="blog-prose" dangerouslySetInnerHTML={{ __html: post.html }} />
      </article>
    </div>
  )
}
