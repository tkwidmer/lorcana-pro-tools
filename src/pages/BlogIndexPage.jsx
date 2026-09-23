import { Link } from 'react-router-dom'
import { listPosts } from '../lib/blog'
import { PostByline } from '../components/PostByline'

export function BlogIndexPage() {
  const posts = listPosts()

  return (
    <div className="w-full px-6 py-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Blog</h1>
        <ul className="divide-y divide-gray-200">
          {posts.map(post => (
            <li key={post.slug} className="py-6 first:pt-0">
              <h2 className="text-lg font-semibold text-gray-900">
                <Link to={`/blog/${post.slug}`} className="hover:underline">
                  {post.title}
                </Link>
              </h2>
              <PostByline post={post} className="mt-1" />
              <p className="text-sm text-gray-700 mt-2">{post.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
