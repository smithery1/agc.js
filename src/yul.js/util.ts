import { AssembledCard } from './assembly'

const whitespace = /^\s+$/
/**
 * Returns true iff the specified string consists entirely of whitespace.
 *
 * @param str the string to test
 * @returns true iff the specified string consists entirely of whitespace
 */
export function isWhitespace (str: string): boolean {
  return whitespace.test(str)
}

/**
 * Returns true if the specified word should have a parity bit of 1 and false if it should have a parity bit of 0.
 * The AGC parity is defined as the single bit value required to make the sum of bit values in the word odd, including
 * the parity bit.
 *
 * @param word the word to parity
 * @returns the parity indication
 */
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

/**
 * Returns a readable representation of the source file and line number for the specified card.
 *
 * @param card the card whose source string to return
 * @returns a readable representation of the source file and line number for the specified card
 */
export function sourceString (card: AssembledCard): string {
  return card.lexedLine.sourceLine.source + ':' + card.lexedLine.sourceLine.lineNumber.toString()
}
