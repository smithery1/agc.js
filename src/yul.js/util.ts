import { AssembledCard } from './assembly'

/**
 * The mask used to obtain the one's complement of a 15-bit word.
 */
export const COMPLEMENT_MASK = 0x7FFF

/**
* One's complement negative zero
*/
export const NEGATIVE_ZERO = COMPLEMENT_MASK

/**
* A quantity used as a placeholder when an error prevents determining a correct value.
*/
export const ERROR_WORD = 0

/**
 * The maximum quantity that can be held in a 15 bit word
 */
export const MAX_15_BITS = 0x7FFF

const WHITESPACE_EXPR = /^\s+$/
/**
 * Returns true iff the specified string consists entirely of whitespace.
 *
 * @param str the string to test
 * @returns true iff the specified string consists entirely of whitespace
 */
export function isWhitespace (str: string): boolean {
  return WHITESPACE_EXPR.test(str)
}

const OCTAL_EXPR = /^[0-7]+$/
/**
 * Returns true iff the specified string consists entirely of octal digits.
 *
 * @param str the string to test
 * @returns true iff the specified string consists entirely of octal digits
 */
export function isOctal (str: string): boolean {
  return OCTAL_EXPR.test(str)
}

const SIGNED_EXPR = /^[+-]\s*\d+D?$/
/**
 * Returns true iff the specified string is a signed numeric value.
 *
 * @param str the string to test
 * @returns true iff the specified string is a signed numeric value
 */
export function isSigned (str: string): boolean {
  return SIGNED_EXPR.test(str)
}

const UNSIGNED_EXPR = /^\d+D?$/
/**
 * Returns true iff the specified string is an unsigned numeric value.
 *
 * @param str the string to test
 * @returns true iff the specified string is an unsigned numeric value
 */
export function isUnsigned (str: string): boolean {
  return UNSIGNED_EXPR.test(str)
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
