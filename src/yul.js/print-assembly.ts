import { compat } from '../common/compat'
import * as addressing from './addressing'
import { AssembledCard } from './assembly'
import { Cells } from './cells'
import { Cusses, CussInstance } from './cusses'
import { LexedLine } from './lexer'
import { isBasic, isClerical, isRemark } from './parser'
import { Pass2Output } from './pass2'
import { parity } from './util'

const COLUMNS = {
  LineNumber: 4,
  Context: 15,
  Address: 7,
  CellWord: 7,
  Location: 8,
  Instruction: 6,
  Operand: 24,
  Page: 4
}

const EMPTY_LINE_NUMBER = ' '.repeat(COLUMNS.LineNumber)
const EMPTY_CELL_WORD = ' '.repeat(COLUMNS.CellWord)

export function printCuss (instance: CussInstance): void {
  const formattedSerial = instance.cuss.serial.toString(16).toUpperCase().padStart(2, '0')
  compat.log(formattedSerial, instance.cuss.message)
  if (instance.error !== undefined) {
    compat.log('        ', instance.error.message)
  }
  if (instance.context !== undefined) {
    instance.context.forEach(item => {
      compat.log('        ', item)
    })
  }
}

export function printAssembly (pass2: Pass2Output): void {
  let source = ''
  let page = 0
  let eBank = 0
  let sBank = 0

  pass2.inputCards.forEach(card => {
    if (source !== card.lexedLine.sourceLine.source || page !== card.lexedLine.sourceLine.page) {
      const newSource = source !== card.lexedLine.sourceLine.source
      source = card.lexedLine.sourceLine.source
      page = card.lexedLine.sourceLine.page
      printHeader(source, page, eBank, sBank)
      if (newSource) {
        source = card.lexedLine.sourceLine.source
      }
    }
    if (isRemark(card.card)) {
      if (card.card.fullLine) {
        printFullLineRemark(card.lexedLine)
      } else {
        printInstructionCard(card, pass2.cells, 'A')
      }
    } else {
      printInstructionCard(card, pass2.cells, ' ')
    }
    printCusses(card.cusses)
    eBank = card.eBank
    sBank = card.sBank
  })
}

function printHeader (source: string, page: number, eBank: number, sBank: number): void {
  const pageString = page.toString().padStart(COLUMNS.Page)
  const eBankString = 'E' + eBank.toString()
  const sBankString = sBank === 0 ? '' : 'S' + sBank.toString()
  if (page > 1) {
    compat.output('')
  }
  compat.output('L', EMPTY_LINE_NUMBER, source)
  compat.output('L', EMPTY_LINE_NUMBER, 'PAGE', pageString, '    ', eBankString, sBankString)
}

function printFullLineRemark (line: LexedLine): void {
  const lineNumber = lineNumberString(line)
  const remark = line.remark ?? ''
  compat.output('R', lineNumber, remark)
}

function lineNumberString (line: LexedLine | undefined): string {
  const lineNumber = line?.sourceLine.lineNumber.toString() ?? ''
  return lineNumber.padStart(COLUMNS.LineNumber)
}

function printLine (
  type: string,
  card: AssembledCard | null,
  address: string,
  word: string, parity: string,
  field1?: string, field2?: string, field3?: string, remark?: string): void {
  const lineNumber = lineNumberString(card?.lexedLine)
  const context = (card?.assemblerContext ?? '').padEnd(COLUMNS.Context)

  if (field1 === undefined) {
    compat.output(type, lineNumber, context, address, word, parity)
  } else {
    compat.output(type, lineNumber, context, address, word, parity, field1, field2, field3, remark)
  }
}

function printInstructionCard (card: AssembledCard, cells: Cells, type: string): void {
  const { field1, field2, field3, remark } = formatLine(card.lexedLine)
  if (card.refAddress === undefined) {
    const address = addressString(undefined)
    const word = wordString(card, undefined)
    printLine(type, card, address, word, ' ', field1, field2, field3, remark)
  } else if (card.extent === 0) {
    const address = addressString(card.refAddress)
    const word = wordString(card, undefined)
    printLine(type, card, address, word, ' ', field1, field2, field3, remark)
  } else if (isClerical(card.card) && card.card.operation.operation.symbol === 'ERASE') {
    printEraseCell(card, card.refAddress, field1, field2, field3, remark)
  } else {
    printCell(cells, card, card.refAddress, field1, field2, field3, remark)
    for (let i = 1; i < card.extent; i++) {
      printCell(cells, null, card.refAddress + i)
    }
  }
}

function printEraseCell (
  card: AssembledCard,
  address: number,
  field1?: string, field2?: string, field3?: string, remark?: string): void {
  const octalAddress = addressString(address)
  const endAddress = addressString(address + card.extent - 1)
  printLine(' ', card, octalAddress, endAddress, ' ', field1, field2, field3, remark)
}

function printCell (
  cells: Cells,
  card: AssembledCard | null,
  address: number,
  field1?: string, field2?: string, field3?: string, remark?: string): void {
  const octalAddress = addressString(address)
  const word = cells.value(address)
  const octalWord = wordString(card, word)
  const parityBit = word === undefined ? ' ' : (parity(word) ? '1' : '0')
  printLine(' ', card, octalAddress, octalWord, parityBit, field1, field2, field3, remark)
}

function addressString (address?: number): string {
  return addressing.asAssemblyString(address).padStart(COLUMNS.Address)
}

function wordString (card: AssembledCard | null, word?: number): string {
  if (word === undefined) {
    return EMPTY_CELL_WORD
  }

  if (card !== null && isBasic(card.card)) {
    if (card.card.operation.operation.qc === undefined) {
      const highDigit = (word & 0x7000) >> 12
      const lowDigits = word & 0xFFF

      return ' ' + highDigit.toString(8) + ' ' + lowDigits.toString(8).padStart(4, '0')
    } else {
      const highDigits = (word & 0x7E00) >> 9
      const lowDigits = word & 0xFF

      return ' ' + highDigits.toString(8).padStart(2, '0') + ' ' + lowDigits.toString(8).padStart(3, '0')
    }
  }

  return '  ' + word.toString(8).padStart(5, '0')
}

function formatLine (line: LexedLine): { field1: string, field2: string, field3: string, remark: string } {
  let field1: string
  let field2: string
  let field3: string
  let remark: string
  let field1Pad = false
  let field2Pad = false
  let field3Pad = false

  field1 = (line.field1 === undefined ? '' : line.field1)

  if (line.field2 === undefined) {
    field2 = ''
  } else {
    field1Pad = true
    field2 = line.field2.charAt(0) === '-' ? '' : ' '
    field2 += line.field2.padEnd(COLUMNS.Instruction)
  }

  if (line.field3 === undefined) {
    field3 = ''
  } else {
    field1Pad = field2Pad = true
    field3 = line.field3.replace(/\s+/g, ' ')
  }

  if (line.remark === undefined) {
    remark = ''
  } else {
    field1Pad = field2Pad = field3Pad = true
    remark = line.remark
  }

  if (field1Pad) {
    field1 = field1.padEnd(COLUMNS.Location, ' ')
  }
  if (field2Pad) {
    // Add 1 for leading compliment space
    field2 = field2.padEnd(COLUMNS.Instruction + 1, ' ')
  }
  if (field3Pad) {
    field3 = field3.padEnd(COLUMNS.Operand, ' ')
  }

  return { field1, field2, field3, remark }
}

function printCusses (cusses?: Cusses): void {
  if (cusses !== undefined) {
    cusses.cusses().forEach(instance => {
      const formattedSerial = instance.cuss.serial.toString(16).toUpperCase().padStart(2, '0')
      compat.log('E', '    ', formattedSerial, instance.cuss.message)
      if (instance.error !== undefined) {
        compat.log('E', '        ', instance.error.message)
      }
      if (instance.context !== undefined) {
        instance.context.forEach(item => {
          compat.log('E', '        ', item)
        })
      }
    })
  }
}
