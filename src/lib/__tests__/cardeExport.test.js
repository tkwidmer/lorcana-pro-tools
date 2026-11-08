import { describe, it, expect } from 'vitest'
import { parseCsv, decksFromExport, decklistsFromExport } from '../cardeExport'

const card = (name, version, color, setCode) => ({ name, fullName: `${name} - ${version}`, color, setCode })
// "Judy Hopps" alone fits Amber, Sapphire or Steel; Daisy Duck Amber or
// Sapphire. With names only, every pair with Amber covers the deck; the share
// of printings that fit breaks the tie toward Amber/Sapphire.
const CARDS = [
  card('Judy Hopps', 'Helpful Officer', 'Amber', '14'),
  card('Judy Hopps', 'Lead Detective', 'Sapphire', '10'),
  card('Judy Hopps', 'Day Camp Instructor', 'Sapphire', '14'),
  card('Judy Hopps', 'Steel Cop', 'Steel', '5'),
  card('Daisy Duck', 'Ghost Finder', 'Sapphire', '10'),
  card('Daisy Duck', 'Donald\'s Date', 'Amber', '2'),
  card('Nick Wilde', 'Providing Backup', 'Amber', '14'),
  card('Aladdin & Genie', 'Duo', 'Amethyst-Emerald', '13'),
  card('Malicious, Mean, and Scary', 'Song', 'Emerald', '12'),
]

const JSON_EXPORT = JSON.stringify({
  decklists: [
    { sections: [{ section_key: 'main', cards: [{ name: 'Judy Hopps', quantity: 4 }, { name: 'Daisy Duck', quantity: 4 }, { name: 'Nick Wilde', quantity: 4 }] }] },
    { sections: [{ section_key: 'main', cards: [{ name: 'Aladdin & Genie', quantity: 4 }, { name: 'Malicious, Mean, and Scary', quantity: 2 }, { name: 'Not A Card', quantity: 1 }] }] },
  ],
})

const CSV_EXPORT = [
  'user__id,user__best_identifier,section__key,card__name,card__quantity,card__set_code',
  '1,Kyle R,main,Judy Hopps,4,set10',
  '1,Kyle R,main,Judy Hopps,4,set5',
  '2,"Smith, J",main,"Malicious, Mean, and Scary",2,set12',
  '2,"Smith, J",main,Aladdin & Genie,4,set13',
].join('\r\n') + '\r\n'

describe('parseCsv', () => {
  it('reads quoted commas, doubled quotes and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, ""y""",z\r\n')).toEqual([{ a: 'x, "y"', b: 'z' }])
  })
})

describe('decksFromExport', () => {
  it('reads the JSON and the CSV into one deck per player', () => {
    expect(decksFromExport(JSON_EXPORT)[0]).toEqual([{ name: 'Judy Hopps', count: 4 }, { name: 'Daisy Duck', count: 4 }, { name: 'Nick Wilde', count: 4 }])
    expect(decksFromExport(CSV_EXPORT)).toEqual([
      [{ name: 'Judy Hopps', count: 4, setCode: '10' }, { name: 'Judy Hopps', count: 4, setCode: '5' }],
      [{ name: 'Malicious, Mean, and Scary', count: 2, setCode: '12' }, { name: 'Aladdin & Genie', count: 4, setCode: '13' }],
    ])
  })
})

describe('decklistsFromExport', () => {
  it('resolves bare names to printings in the deck\'s ink pair, keeping unknown names', () => {
    expect(decklistsFromExport(JSON_EXPORT, CARDS)).toBe(
      '4 Judy Hopps - Helpful Officer\n4 Daisy Duck - Ghost Finder\n4 Nick Wilde - Providing Backup\n\n'
      + '4 Aladdin & Genie - Duo\n2 Malicious, Mean, and Scary - Song\n1 Not A Card')
  })
  it('narrows a name to the CSV\'s set first', () => {
    // Set 10 is only Sapphire and set 5 only Steel, so the pair is Sapphire/Steel.
    expect(decklistsFromExport(CSV_EXPORT, CARDS).split('\n\n')[0]).toBe('4 Judy Hopps - Lead Detective\n4 Judy Hopps - Steel Cop')
  })
  it('throws on a file with no decks', () => {
    expect(() => decklistsFromExport('{"decklists":[]}', CARDS)).toThrow('No decklists found')
  })
})
