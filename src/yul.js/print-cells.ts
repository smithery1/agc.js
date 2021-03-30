import { compat } from '../common/compat'
import * as addressing from './addressing'
import { Cell } from './cells'
import * as ops from './operations'
import * as parse from './parser'
import { parity } from './util'

const COLUMNS = {
  Paragraph: 3,
  Address: 7,
  Type: 5,
  Value: 5,
  Parity: 1
}

const BNKSUM_OP = ops.requireOperation('BNKSUM')
const P_OP = ops.requireOperation('P')

export function printCells (cells: Cell[]): void {
  let paragraph = -1

  for (let i = 0; i < cells.length; i += 8) {
    if (i % 32 === 0) {
      compat.output('')
    }
    printLine(i, cells)
  }

  function printLine (startIndex: number, cells: Cell[]): void {
    interface PrintEntry {
      type: string
      value: string
      parity: string
    }

    const address = addressing.fixedMemoryAddress(startIndex)
    const addressString = addressing
      .asAssemblyString(address)
      .padStart(COLUMNS.Address, ' ')

    const addressParagraph = addressing.paragraph(address)
    if (addressParagraph !== undefined && addressParagraph !== paragraph) {
      paragraph = addressParagraph
      compat.output('OCTAL LISTING FOR PARAGRAPH #', paragraph.toString(8).padStart(COLUMNS.Paragraph, '0'))
      compat.output('')
    }

    const entries: PrintEntry[] = []
    for (let i = startIndex; i < startIndex + 8; i++) {
      const result = entry(cells[i])
      result.type = result.type.padStart(COLUMNS.Type, ' ')
      result.value = result.value.padStart(COLUMNS.Value, '0')
      result.parity = result.parity.padStart(COLUMNS.Parity, ' ')
      entries.push(result)
    }

    compat.output(
      addressString,
      entries[0].type, entries[0].value, entries[0].parity,
      entries[1].type, entries[1].value, entries[1].parity,
      entries[2].type, entries[2].value, entries[2].parity,
      entries[3].type, entries[3].value, entries[3].parity,
      entries[4].type, entries[4].value, entries[4].parity,
      entries[5].type, entries[5].value, entries[5].parity,
      entries[6].type, entries[6].value, entries[6].parity,
      entries[7].type, entries[7].value, entries[7].parity
    )

    function entry (cell: Cell | undefined): PrintEntry {
      if (cell?.value === undefined) {
        return { type: '', value: '  @'.padEnd(COLUMNS.Value, ' '), parity: '' }
      }

      let type = ''
      const card = cell.definition.card
      if (parse.isAddressConstant(card)) {
        if (card.operation.operation === P_OP) {
          type = 'I:'
        } else {
          type = 'C:'
        }
      } else if (parse.isNumericConstant(card)) {
        type = 'C:'
      } else if (parse.isClerical(card)) {
        if (card.operation.operation === BNKSUM_OP) {
          type = 'CKSUM'
        } else {
          type = 'C:'
        }
      }
      const parityString = parity(cell.value) ? '1' : '0'
      return { type, value: cell.value.toString(8), parity: parityString }
    }
  }
}

export function printCellsCompact (cells: Cell[]): void {
  for (let i = 0; i < cells.length; i += 8) {
    printLine(i, cells)
  }

  function printLine (startIndex: number, cells: Cell[]): void {
    const address = addressing.fixedMemoryAddress(startIndex)
    const addressString = addressing
      .asAssemblyString(address)
      .padStart(COLUMNS.Address, ' ')

    const entries: string[] = []
    entries.push(addressString)
    for (let i = startIndex; i < startIndex + 8; i++) {
      const value = cells[i]?.value
      if (value === undefined) {
        entries.push('  @'.padEnd(COLUMNS.Value))
      } else {
        entries.push(value.toString(8).padStart(COLUMNS.Value, '0'))
      }
    }

    compat.output(...entries)
  }
}
