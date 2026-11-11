import { Link } from 'react-router-dom'

// A card name that links to its card page when we know the printing.
export function CardLink({ name, href, className = '' }) {
  return href
    ? <Link to={href} className={`hover:underline ${className}`}>{name}</Link>
    : <span className={className}>{name}</span>
}
