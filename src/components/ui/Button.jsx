import { Link } from 'react-router-dom'

// The one button style. `primary` is the forge-gold fill — use it for the
// single main action on a page (Load, Save, Connect). `to` renders a router
// Link, `href` an external anchor, otherwise a <button type="button">.
const VARIANTS = {
  primary: 'bg-forge text-on-forge border-forge hover:bg-forge/85',
  secondary: 'bg-transparent text-gray-900 border-gray-900 hover:bg-gray-900 hover:text-white',
  quiet: 'bg-transparent text-gray-600 border-gray-300 hover:border-gray-500 hover:text-gray-900',
  danger: 'bg-transparent text-gray-500 border-gray-300 hover:border-red-400 hover:text-red-600',
}

const SIZES = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-4 py-2',
}

export function Button({ variant = 'secondary', size = 'md', to, href, className = '', ...props }) {
  if (!VARIANTS[variant]) throw new Error(`Unknown Button variant: ${variant}`)
  if (!SIZES[size]) throw new Error(`Unknown Button size: ${size}`)

  const cls = `inline-flex items-center justify-center gap-2 border rounded font-display uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`

  if (to) return <Link to={to} className={cls} {...props} />
  if (href) return <a href={href} className={cls} {...props} />
  return <button type="button" className={cls} {...props} />
}
