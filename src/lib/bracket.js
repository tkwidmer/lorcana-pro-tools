// Bracket round names by how many matches the round holds, shared by the
// Tournament Lookup bracket and the Stream Overlay's break-screen bracket.
export function bracketRoundLabel(matchCount, roundNum, phaseName) {
  switch (matchCount) {
    case 1: return 'Final'
    case 2: return 'Semifinals'
    case 4: return 'Quarterfinals'
    case 8: return 'Round of 16'
    case 16: return 'Round of 32'
    case 32: return 'Round of 64'
    default: return `${phaseName ?? 'Bracket'} · Round ${roundNum}`
  }
}
