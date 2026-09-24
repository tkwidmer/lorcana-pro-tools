// A bordered surface. Pass `title` (and optionally `description`) for the
// standard card heading; padding is the caller's via `className`.
export function Card({ title, description, className = '', children }) {
  return (
    <div className={`bg-white border border-gray-200 rounded-lg ${className}`}>
      {title && (
        <h2 className="font-display text-base font-medium uppercase tracking-wide text-gray-900 mb-1">
          {title}
        </h2>
      )}
      {description && <div className="text-sm text-gray-500 mb-5">{description}</div>}
      {children}
    </div>
  )
}
