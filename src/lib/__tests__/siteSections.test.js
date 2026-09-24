import { describe, it, expect } from 'vitest'
import { SECTIONS, findTool } from '../siteSections'
import { TOOL_ICONS } from '../toolIcons'

describe('siteSections', () => {
  it('gives every section a nav label and every tool a known icon', () => {
    for (const section of SECTIONS) {
      expect(section.navLabel).toBeTruthy()
      for (const tool of section.tools) {
        expect(Object.keys(TOOL_ICONS)).toContain(tool.icon)
      }
    }
  })

  it('finds the tool and section for a catalog path', () => {
    const match = findTool('/cut-calculator')
    expect(match.tool.name).toBe('Cut Calculator')
    expect(match.section.title).toBe('Tournament Tools')
  })

  it('matches sub-routes by path prefix', () => {
    expect(findTool('/rules/comprehensive-rules').tool.name).toBe('Rules')
  })

  it('does not match a path that only shares a prefix string', () => {
    expect(findTool('/rulesets')).toBeNull()
  })

  it('returns null for pages outside the catalog', () => {
    expect(findTool('/settings')).toBeNull()
    expect(findTool('/')).toBeNull()
  })
})
