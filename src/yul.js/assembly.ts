import { Cusses } from './cusses'
import { LexedLine } from './lexer'
import { InstructionCard, RemarkCard } from './parser'

export interface AssembledCard {
  readonly lexedLine: LexedLine
  readonly card?: RemarkCard | InstructionCard
  refAddress?: number
  extent: number
  assemblerContext?: string
  eBank: number
  sBank: number
  cusses?: Cusses
}

export function getCusses (assembled: AssembledCard): Cusses {
  if (assembled.cusses === undefined) {
    assembled.cusses = new Cusses()
  }
  return assembled.cusses
}
