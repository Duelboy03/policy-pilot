const STOP = new Set(
  `a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its just me more most my no nor not of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours get got give gives need needs want wants please tell much many`.split(
    /\s+/,
  ),
)

/** Words that carry meaning in this domain even though they are short or look like stop words. */
const KEEP = new Set(['pay', 'tax', 'hsa', 'pto', 'fmla', 'cobra', 'w4'])

const VOWEL = /[aeiouy]/

/**
 * A deliberately small suffix stripper. It only needs to conflate the forms that
 * appear in policy text (approve/approved/approval, expense/expenses, accrue/accrual).
 */
export function stem(w: string): string {
  if (w.length <= 3 || /\d/.test(w)) return w
  let s = w
  if (s.endsWith('ies') && s.length > 4) s = s.slice(0, -3) + 'y'
  else if (s.endsWith('sses')) s = s.slice(0, -2)
  else if (!(s.endsWith('ss') || s.endsWith('us') || s.endsWith('is')) && s.endsWith('s')) s = s.slice(0, -1)

  for (const suf of ['ing', 'ed']) {
    if (s.endsWith(suf) && s.length - suf.length >= 3 && VOWEL.test(s.slice(0, -suf.length))) {
      s = s.slice(0, -suf.length)
      if (/([^aeiouls])\1$/.test(s)) s = s.slice(0, -1) // stopped -> stop
      break
    }
  }
  for (const suf of ['ation', 'ition', 'ement', 'ment', 'ness', 'ity', 'ally', 'ly', 'al', 'ers', 'er', 'able', 'ible', 'ful', 'ous', 'ive']) {
    if (s.endsWith(suf) && s.length - suf.length >= 4) {
      s = s.slice(0, -suf.length)
      break
    }
  }
  if (s.endsWith('e') && s.length > 4) s = s.slice(0, -1)
  if (s.endsWith('y') && s.length > 4) s = s.slice(0, -1) + 'i'
  return s
}

/** lowercase word tokens, with `401(k)` kept as one token */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/401\s*\(k\)/g, '401k')
    .replace(/w-4/g, 'w4')
    .replace(/[’']s\b/g, '')
    .match(/[a-z0-9]+/g) ?? []
}

/** stemmed, stop-word-free tokens used by the keyword index */
export function tokenize(text: string): string[] {
  return words(text)
    .filter((w) => (!STOP.has(w) || KEEP.has(w)) && w.length > 1)
    .map(stem)
}

export const isStop = (w: string) => STOP.has(w.toLowerCase()) && !KEEP.has(w.toLowerCase())
