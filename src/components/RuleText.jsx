import { bulletLevel } from '../lib/rules'

const BULLET = { 1: '•', 2: '◦' }

export function RuleText({ text, className = '' }) {
  if (!text) return null
  return text.split('\n\n').map((paragraph, i) => {
    const { level, text: body } = bulletLevel(paragraph)
    return (
      <p
        key={i}
        className={`${className} ${i > 0 ? (level ? 'mt-1' : 'mt-2') : ''} ${/^Example[^a-z]/.test(body) ? 'italic text-gray-500' : ''} ${level ? 'flex gap-2' : ''}`}
        style={level ? { paddingLeft: (level - 1) * 20 + 4 } : undefined}
      >
        {level ? <><span aria-hidden="true" className="text-gray-400">{BULLET[level]}</span><span>{body}</span></> : body}
      </p>
    )
  })
}
