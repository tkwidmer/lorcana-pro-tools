import { describe, it, expect } from 'vitest'
import { formatPostDate, AUTHOR_LINK_REL } from '../blogMeta'

describe('blogMeta', () => {
  it('formats a post date as the same calendar day in every timezone', () => {
    expect(formatPostDate('2026-09-23')).toBe('September 23, 2026')
    expect(formatPostDate('2026-01-01')).toBe('January 1, 2026')
  })
  it('marks author links for crawlers', () => {
    expect(AUTHOR_LINK_REL.split(' ')).toContain('author')
  })
})
