export interface VimNumberEdit {
  start: number
  end: number
  inserted: string
  nextCursor: number
}

/** Normal-mode number arithmetic with Vim's defaults.vim formats (bin,hex). */
export function changeVimNumber(text: string, cursor: number, amount: number): VimNumberEdit | undefined {
  const numbers = /-?(?:0[xX][0-9a-fA-F]+|0[bB][01]+|[0-9]+)/gu
  for (const match of text.matchAll(numbers)) {
    const unsignedBase = /^-0[xXbB]/u.test(match[0])
    const token = unsignedBase ? match[0].slice(1) : match[0]
    const start = match.index + (unsignedBase ? 1 : 0)
    const end = start + token.length
    if (end <= cursor) continue

    const prefix = /^0[xXbB]/u.test(token) ? token.slice(0, 2) : ''
    const radix = prefix.toLowerCase() === '0x' ? 16 : prefix === '' ? 10 : 2
    const digits = prefix === '' ? token.replace(/^-/u, '') : token.slice(2)
    const value = BigInt(token)
    const maximum = (1n << 64n) - 1n
    const magnitude = value < 0n ? -value : value
    let next: bigint
    if (magnitude > maximum) next = value < 0n ? -maximum : maximum
    else if (radix !== 10) next = BigInt.asUintN(64, value + BigInt(amount))
    else {
      const negative = value < 0n
      const delta = negative ? -BigInt(amount) : BigInt(amount)
      let absolute = BigInt.asUintN(64, magnitude + delta)
      let resultNegative = negative
      if (delta < 0n && absolute > magnitude) {
        absolute = BigInt.asUintN(64, -absolute)
        resultNegative = !resultNegative
      } else if (delta > 0n && absolute < magnitude) {
        absolute = maximum ^ absolute
        resultNegative = !resultNegative
      }
      next = resultNegative ? -absolute : absolute
    }

    const negative = next < 0n
    let result = (negative ? -next : next).toString(radix)
    const letters = token.match(/[a-zA-Z]/gu)
    const lastLetter = letters?.at(-1)
    const uppercase = lastLetter !== undefined && lastLetter === lastLetter.toUpperCase()
    if (radix === 16 && uppercase) result = result.toUpperCase()
    if (digits.startsWith('0') || prefix !== '') result = result.padStart(digits.length, '0')
    const inserted = `${negative ? '-' : ''}${prefix}${result}`
    return {
      start,
      end,
      inserted,
      nextCursor: start + inserted.length - 1,
    }
  }
  return undefined
}
