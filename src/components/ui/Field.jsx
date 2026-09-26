// Text inputs share one look: white surface, gray hairline, ink focus.
const FIELD =
  'bg-white border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-900 transition-colors'

export function Input({ className = '', ...props }) {
  return <input className={`${FIELD} ${className}`} {...props} />
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={`${FIELD} ${className}`} {...props} />
}

export function Select({ className = '', ...props }) {
  return <select className={`${FIELD} ${className}`} {...props} />
}
