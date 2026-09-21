// The [Format Coconut] full-art card faces are Nathan Trippe's work. Both the
// deck builder and the Proxy Generator display them, so both carry the credit
// from here rather than repeating the name and link in each page.
export function CoconutArtCredit({ className = '' }) {
  return (
    <p className={`text-xs text-gray-500 ${className}`}>
      Full-art card designs by{' '}
      <a
        href="https://x.com/NathanTrippe"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-gray-900"
      >
        Nathan Trippe
      </a>
    </p>
  )
}
