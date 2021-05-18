import { AssembledCard, getCusses } from './assembly'
import * as cusses from './cusses'
import { Memory } from './memory'
import { sourceString } from './util'

/**
 * A single word of memory.
 */
export interface Cell {
  readonly definition: AssembledCard
  value?: number
}

/**
 * Manages memory during the assembly process by associating cards and values with memory locations.
 * Performs sanity checking to ensure locations are not over-assigned, that values are not out of range, etc. and adds
 * cusses in those cases.
 *
 * All input addresses are assumed in true address form.
 */
export class Cells {
  private readonly cells: Cell[]

  constructor (private readonly memory: Memory) {
    this.cells = new Array<Cell>(memory.cellCount())
  }

  /**
   * Returns true iff the specified address is assigned a card and/or value.
   *
   * @param address the address to test
   * @returns true iff the specified address is assigned a card and/or value
   */
  isAssigned (address: number): boolean {
    return this.cells[this.memory.memoryOffset(address)] !== undefined
  }

  /**
   * Assigns the specified card to the specified address.
   * This is used during pass 1 to reserve memory locations, when the binary value for the location is not yet known.
   * If the address is already assigned, adds a Cuss26 to the new and old assigned cards and overwrites the assignment.
   *
   * @param address the address to assign
   * @param definition the card to associate with the address
   */
  assignDefinition (address: number, definition: AssembledCard): void {
    if (address < 0) {
      getCusses(definition).add(cusses.Cuss5C, 'Invalid address: ' + address.toString())
      return
    }

    const location = this.memory.memoryOffset(address)
    const existing = this.cells[location]

    if (existing?.definition !== undefined) {
      this.cussConflict(existing.definition, definition)
    }

    this.cells[location] = { definition }
  }

  /**
   * Assigns the specified value and card to the specified address.
   *
   * Adds cusses for the following situations.
   * - Cuss 5C: The value is negative or greater than 15 bits. This is an internal assembler error.
   * - Cuss 5C: The address wasn't assigned in pass1. This is an internal assembler error.
   * - Cuss 26: The address already has a value assigned. Cuss is adds to the old and new cards, and the existing value
   *   is overwritten with the new one.
   * If the address is unassigned,
   * If the address is already assigned, adds a Cuss26 to the new and old assigned cards and overwrites the assignment.
   *
   * @param address the address to assign
   * @param value the value to associate with the address
   * @param definition the definition associated with the address, used if the address was not already assigned
   */
  assignValue (address: number, value: number, definition: AssembledCard): void {
    if (address < 0) {
      getCusses(definition).add(cusses.Cuss5C, 'Invalid address: ' + address.toString())
      return
    }

    if (value < 0 || value > 0x7FFF) {
      getCusses(definition).add(
        cusses.Cuss5C, 'Value out of range', this.memory.asAssemblyString(address), value.toString(8))
    }
    const location = this.memory.memoryOffset(address)
    const existing = this.cells[location]
    if (existing?.definition === undefined) {
      getCusses(definition).add(cusses.Cuss5C, 'Address not assigned in pass 1', this.memory.asAssemblyString(address))
      this.cells[location] = { definition: definition, value }
    } else {
      if (existing.value !== undefined) {
        this.cussConflict(existing.definition, definition)
      }
      existing.value = value
    }
  }

  /**
   * Behaves like assignValue, but assumes the location has no card assigned.
   * This is used for assigning BNKSUM values in pass 2.
   *
   * @param address the address to assign
   * @param value the value to associate with the address
   * @param definition the definition associated with the address
   */
  assignDefinitionAndValue (address: number, value: number, definition: AssembledCard): void {
    if (address < 0) {
      getCusses(definition).add(cusses.Cuss5C, 'Invalid address: ' + address.toString())
      return
    }

    if (value < 0 || value > 0x7FFF) {
      getCusses(definition).add(
        cusses.Cuss5C, 'Value out of range', this.memory.asAssemblyString(address), value.toString(8))
    }
    const location = this.memory.memoryOffset(address)
    const existing = this.cells[location]
    if (existing !== undefined) {
      this.cussConflict(existing.definition, definition)
    }
    this.cells[location] = { definition, value }
  }

  /**
   * Returns the value associated with the specified address, or undefined if the address is unassigned.
   *
   * @param address the address for which to return a value
   * @returns the value
   */
  value (address: number): number | undefined {
    return this.cells[this.memory.memoryOffset(address)]?.value
  }

  /**
   * Returns the address of the first unassigned cell in the specified range, or undefined if all are assigned.
   *
   * @param bank the bank range to check (inclusive)
   * @returns the address of the first unassigned cell in the specified range, or undefined if all are assigned
   */
  findFirstFree (bank: { min: number, max: number }): number | undefined {
    for (let i = bank.min; i <= bank.max; i++) {
      if (this.cells[this.memory.memoryOffset(i)] === undefined) {
        return i
      }
    }

    return undefined
  }

  /**
   * Returns the address of the last assigned cell in the specified range, or undefined if all are unassigned.
   *
   * @param bank the bank range to check (inclusive)
   * @returns the address of the last assigned cell in the specified range, or undefined if all are unassigned
   */
  findLastUsed (bank: { min: number, max: number }): number | undefined {
    for (let i = bank.max; i >= bank.min; i--) {
      if (this.cells[this.memory.memoryOffset(i)] !== undefined) {
        return i
      }
    }

    return undefined
  }

  private cussConflict (existing: AssembledCard, update: AssembledCard): void {
    getCusses(existing).add(
      cusses.Cuss26,
      'Subsequently assigned here:', sourceString(update),
      update.lexedLine.sourceLine.line
    )
    getCusses(update).add(
      cusses.Cuss26,
      'Previously assigned here:', sourceString(existing),
      existing.lexedLine.sourceLine.line
    )
  }

  /**
   * Provides access to the raw cell data for printing purposes.
   * See print-cells.ts.
   */
  getCells (): Cell[] {
    return this.cells
  }
}
