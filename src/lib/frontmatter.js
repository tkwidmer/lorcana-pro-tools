// Splits a `---`-delimited `key: value` frontmatter block off the top of a
// content file. Shared by blog posts and The Forge's deck lists.
export function splitFrontmatter(filename, raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) throw new Error(`${filename}: missing --- frontmatter block`)

  const fields = {}
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue
    const sep = line.indexOf(':')
    if (sep === -1) throw new Error(`${filename}: bad frontmatter line "${line}"`)
    fields[line.slice(0, sep).trim()] = line.slice(sep + 1).trim()
  }
  return { fields, body: match[2] }
}
