import { Cusses } from './cusses'
import { LexedLine } from './lexer'
import { AssemblyCard, RemarkCard } from './parser'

/**
 * The mask used to obtain the one's complement of a 15-bit word.
 */
export const COMPLEMENT_MASK = 0x7FFF

/**
 * A quantity used as a placeholder when an error prevents determining a correct value.
 */
export const ERROR_WORD = 0

/**
 * Holds information about a single assembled line or "card".
 */
export interface AssembledCard {
  readonly lexedLine: LexedLine
  readonly card?: RemarkCard | AssemblyCard
  refAddress?: number
  extent: number
  assemblerContext?: string
  count: number
  eBank: number
  sBank: number
  cusses?: Cusses
}

/**
 * Lazily creates and returns the cusses for the specified card.
 *
 * @param card the card for which to return cusses
 * @returns the cusses for the specified card
 */
export function getCusses (card: AssembledCard): Cusses {
  if (card.cusses === undefined) {
    card.cusses = new Cusses()
  }
  return card.cusses
}
