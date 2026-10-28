import { describe, it, expect } from 'vitest'
import { splitFrontmatter } from '../frontmatter'

describe('splitFrontmatter', () => {
  it('splits the fields off the body, trimming keys and values and skipping blank lines', () => {
    const { fields, body } = splitFrontmatter('a.md', '---\ntitle: Hello: world\n\ndate:2026-01-02\n---\n# Body\n')
    expect(fields).toEqual({ title: 'Hello: world', date: '2026-01-02' })
    expect(body).toBe('# Body\n')
  })
  it('accepts Windows line endings and an empty body', () => {
    expect(splitFrontmatter('a.md', '---\r\nname: X\r\n---')).toEqual({ fields: { name: 'X' }, body: '' })
  })
  it('throws, naming the file, on a missing block or a line without a colon', () => {
    expect(() => splitFrontmatter('a.md', 'no block')).toThrow('a.md: missing --- frontmatter block')
    expect(() => splitFrontmatter('a.md', '---\njust words\n---\n')).toThrow('a.md: bad frontmatter line "just words"')
  })
})
