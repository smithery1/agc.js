import * as addressing from './addressing'
import { AssembledCard, getCusses } from './assembly'
import * as cusses from './cusses'
import { printCellsCompact } from './print-cells'
import { sourceString } from './util'

export interface Cell {
  readonly definition: AssembledCard
  value?: number
}

export class Cells {
  private readonly cells: Cell[]

  constructor () {
    this.cells = new Array<Cell>(addressing.FIXED_MEMORY_SIZE)
  }

  isAssigned (address: number): boolean {
    return this.cells[addressing.fixedMemoryOffset(address)] !== undefined
  }

  assignDefinition (address: number, definition: AssembledCard): void {
    const location = addressing.fixedMemoryOffset(address)
    const existing = this.cells[location]

    if (existing?.definition !== undefined) {
      this.cussConflict(definition, existing.definition)
    }

    this.cells[location] = { definition }
  }

  assignValue (address: number, value: number, definition: AssembledCard): void {
    if (value > 0x7FFF) {
      getCusses(definition).add(cusses.Cuss5C, 'Value too large', addressing.asAssemblyString(address), value.toString(8))
    }
    const location = addressing.fixedMemoryOffset(address)
    const existing = this.cells[location]
    if (existing?.definition === undefined) {
      getCusses(definition).add(cusses.Cuss5C, 'Unassigned address', addressing.asAssemblyString(address))
      this.cells[location] = { definition: definition, value }
    } else {
      if (existing.value !== undefined) {
        this.cussConflict(definition, existing.definition)
      }
      existing.value = value
    }
  }

  assignDefinitionAndValue (address: number, definition: AssembledCard, value: number): void {
    if (value > 0x7FFF) {
      getCusses(definition).add(
        cusses.Cuss5C, 'Value too large', addressing.asAssemblyString(address), value.toString(8))
    }
    const location = addressing.fixedMemoryOffset(address)
    const existing = this.cells[location]
    if (existing !== undefined) {
      this.cussConflict(definition, existing.definition)
    }
    this.cells[location] = { definition, value }
  }

  value (address: number): number | undefined {
    return this.cells[addressing.fixedMemoryOffset(address)].value
  }

  findFree (bank: { min: number, max: number }): number | undefined {
    for (let i = bank.min; i < bank.max; i++) {
      if (this.cells[addressing.fixedMemoryOffset(i)] === undefined) {
        return i
      }
    }

    return undefined
  }

  private cussConflict (existing: AssembledCard, update: AssembledCard): void {
    getCusses(update).add(
      cusses.Cuss26,
      'Previously assigned here:', sourceString(existing),
      existing.lexedLine.sourceLine.line
    )
    getCusses(existing).add(
      cusses.Cuss26,
      'Subsequently assigned here:', sourceString(update),
      update.lexedLine.sourceLine.line)
  }

  print (): void {
    printCellsCompact(this.cells)
  }
}
