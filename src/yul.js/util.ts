import { AssembledCard } from './assembly'

const whitespace = /\s+/
export function isWhitespace (str: string): boolean {
  return whitespace.test(str)
}

export function parity (word: number): boolean {
  let value = true
  while (word > 0) {
    if ((word & 1) > 0) {
      value = !value
    }
    word >>= 1
  }
  return value
}

export function sourceString (card: AssembledCard): string {
  return card.lexedLine.sourceLine.source + ':' + card.lexedLine.sourceLine.lineNumber.toString()
}
