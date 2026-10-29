import { describe, it, expect } from 'vitest'
import { bulletLevel } from '../rules'

describe('bulletLevel', () => {
  it('reads Word-style bullet markers', () => {
    expect(bulletLevel('• Deck Sleeves')).toEqual({ level: 1, text: 'Deck Sleeves' })
    expect(bulletLevel('o Each sleeve must enclose a single card entirely.')).toEqual({ level: 2, text: 'Each sleeve must enclose a single card entirely.' })
  })

  it('leaves ordinary paragraphs alone', () => {
    expect(bulletLevel('Inner or over sleeves are allowed.')).toEqual({ level: 0, text: 'Inner or over sleeves are allowed.' })
    expect(bulletLevel('of course')).toEqual({ level: 0, text: 'of course' })
  })
})
