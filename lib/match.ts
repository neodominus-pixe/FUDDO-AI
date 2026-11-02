// Picking the table entry whose key actually names a component.
//
// Both lookup tables -- what shape a thing is, what colour it is -- are lists of
// keys matched against a free-text component name, longest key first so that a
// specific match beats a generic substring. That rule alone is not enough:
// English puts the head noun last, so "tomato soup" is a soup and "chicken
// curry" is a curry, but the longest key buried anywhere in the string wins and
// turns them into a slice of tomato and a piece of chicken.
//
// So: a key the name ENDS with beats a longer key in the middle of it. Only if
// nothing matches the end does the longest-anywhere rule apply, which is what
// keeps "ravioli, sage butter" a raviolo rather than a sage leaf.

// Two spellings of the same food must not be two different foods. A chef types
// what is on their menu -- "Crème Brûlée", "shepherd's pie", "mac & cheese" --
// and none of that is going to match a table key letter for letter. Accents,
// apostrophes and punctuation all come off both sides, so the table can be
// written in plain ASCII and still match what a kitchen actually writes.
export function normalise(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// Singular form, word by word. Substring matching already handles most plurals
// -- "tomatoes" contains "tomato" -- but not the ones that change the stem, and
// a menu is written in plurals: berries, curries, loaves, gnocchi. Short words
// are left alone so "peas" does not become "pea" before "pea shoots" is tried,
// and -ss and -us endings are left alone so hummus stays hummus.
function singular(t: string) {
  return t
    .split(' ')
    .map((w) => {
      if (w.length < 4) return w
      if (w.endsWith('ies')) return w.slice(0, -3) + 'y'
      if (w.endsWith('ves')) return w.slice(0, -3) + 'f'
      if (/(ch|sh|s|x|z)es$/.test(w)) return w.slice(0, -2)
      if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1)
      return w
    })
    .join(' ')
}

// A table ready to match against: keys normalised the same way a component name
// will be, longest first. Built once per table rather than per lookup.
export function table<T>(entries: Array<[string, T]>): Array<[string, T]> {
  return entries
    .map(([k, v]) => [normalise(k), v] as [string, T])
    .sort((a, b) => b[0].length - a[0].length)
}

// `lead` is for words that name a preparation rather than an ingredient --
// "diced", "shaved", "whipped". English puts the modifier first, so a leading
// preparation beats an ingredient buried in the middle of the name, but never
// beats the head noun at the end: diced tomato soup is still soup.
// The forms of a name worth matching against, in the order they should be
// tried. Exported because the colour table matches by a different rule to the
// shape table, but has to read the same names.
//
// A chef writes the dish, then what is with it: "ravioli, sage butter", "hake,
// brown shrimp", "spaghetti in tomato sauce". Everything after the break is
// what the dish is dressed in, and noise to a lookup -- and now that the tables
// know what butter and sauce are, it is noise that wins on the head-noun rule.
// So the part before the break is tried first, and the whole name only if that
// finds nothing, which is what keeps "mac and cheese" whole.
// The romance-language menus put the garnish after a preposition where English
// puts it after a comma: a pastilla au pigeon is a pie, not a pigeon. Those
// words break a name the same way " with " does.
const BREAK = /[,(;]| with | in | on | over | topped | au | aux | a la | alla | al /
export function variants(name: string) {
  const whole = normalise(name)
  const head = normalise(name.split(BREAK)[0])
  const out: string[] = []
  for (const q of head && head !== whole ? [head, whole] : [whole]) {
    out.push(q)
    const one = singular(q)
    if (one !== q) out.push(one)
  }
  return out
}

// The same forms as variants(), grouped so a name and its singular travel together.
function readings(name: string): string[][] {
  const whole = normalise(name)
  const head = normalise(name.split(BREAK)[0])
  const out: string[][] = []
  for (const q of head && head !== whole ? [head, whole] : [whole]) {
    const one = singular(q)
    out.push(one !== q ? [q, one] : [q])
  }
  return out
}

// Does the key appear in the name as a word, rather than inside one? Only the
// front of the key is anchored: "tomatoes" has to keep matching "tomato". The
// back is what would have to give, and letting the front go is what quietly
// turned a tarte flambee into a rack of lamb.
function has(name: string, key: string) {
  let i = name.indexOf(key)
  while (i >= 0) {
    if (i === 0 || name[i - 1] === ' ') return true
    i = name.indexOf(key, i + 1)
  }
  return false
}

// `last` is for keys that must never beat a real one: a dish named after its
// sauce. "Carbonara" on its own is a bowl of pasta, but "rigatoni carbonara" is
// rigatoni, and the head-noun rule hands the tail the win -- Italian names the
// sauce last. So those keys are only read once nothing else has matched.
export function matchKey<T>(
  name: string,
  sorted: Array<[string, T]>,
  lead?: Array<[string, T]>,
  last?: Array<[string, T]>,
): T | undefined {
  // A name and its singular are one reading, not two: "toasted seeds" has to see that it ends in "seed" before it
  // settles for "toast" appearing inside "toasted". So within a reading, the head noun is looked for in both forms
  // first, then a leading preparation, and only then a key anywhere in the name.
  for (const forms of readings(name)) {
    const tail = forms.map((q) => sorted.find(([k]) => q.endsWith(k))).find(Boolean)
    if (tail) return tail[1]
    const first = forms.map((q) => lead?.find(([k]) => q.startsWith(k + ' '))).find(Boolean)
    if (first) return first[1]
    const hit = forms.map((q) => sorted.find(([k]) => has(q, k))).find(Boolean)
    if (hit) return hit[1]
  }
  if (!last) return undefined
  for (const q of variants(name)) {
    const hit = last.find(([k]) => has(q, k))
    if (hit) return hit[1]
  }
  return undefined
}
