import * as field from './address-field'
import { AssembledCard, getCusses } from './assembly'
import * as constants from './constants'
import * as cusses from './cusses'
import { LocationField } from './parser'
import { printSymbolTable } from './print-symbol-table'

enum Health {
  MultiplyDefined = 'MD',
  BadlyDefined = 'BD',
  Conflict = 'CD',
  MiscTrouble = ' XX'
}

interface UnresolvedEntry {
  readonly definition: AssembledCard
  readonly references: AssembledCard[]
  readonly value: number | field.AddressField
  health?: Health
}

// Exported for printing
export interface SymbolEntry {
  readonly definition: AssembledCard
  readonly references: AssembledCard[]
  readonly value: number
  health?: Health
}

export interface SymbolTable {
  resolve: (symbol: string, requester: AssembledCard) => number | undefined
}

export class Pass1SymbolTable implements SymbolTable {
  private readonly table = new Map<string, UnresolvedEntry>()

  requireUnassigned (symbol: string, definition: AssembledCard): void {
    const existing = this.table.get(symbol)
    if (existing !== undefined) {
      existing.health = Health.MultiplyDefined
      const existingSourceLine = existing.definition.lexedLine.sourceLine
      getCusses(definition).add(
        cusses.Cuss31,
        'Previously defined here:',
        existingSourceLine.source + ':' + existingSourceLine.lineNumber.toString(),
        existingSourceLine.line
      )
    }
  }

  assignAddress (location: LocationField | undefined, definition: AssembledCard): void {
    if (location !== undefined) {
      let entry: UnresolvedEntry
      this.requireUnassigned(location.symbol, definition)
      if (definition.refAddress === undefined) {
        entry = { definition, references: [], value: constants.ERROR_WORD, health: Health.BadlyDefined }
      } else {
        entry = { definition, references: [], value: definition.refAddress }
      }
      this.table.set(location.symbol, entry)
    }
  }

  assignField (location: LocationField | undefined, address: field.AddressField | undefined,
    definition: AssembledCard): void {
    if (location !== undefined && address !== undefined) {
      this.requireUnassigned(location.symbol, definition)
      this.table.set(location.symbol, { definition, references: [], value: address })
    }
  }

  resolve (symbol: string, requester: AssembledCard): number | undefined {
    const entry = this.table.get(symbol)
    if (entry === undefined) {
      getCusses(requester).add(cusses.Cuss2D, 'No definition for ' + symbol)
      return undefined
    }

    // Do not supply requester, since any cusses added will be added later when we resolve all symbols.
    entry.references.push(requester)
    return this.resolveEntry(symbol, entry)
  }

  resolveAll (): Pass2SymbolTable {
    const visited = new Set<string>()
    const output = new Map<string, SymbolEntry>()
    this.table.forEach((entry: UnresolvedEntry, symbol: string) => {
      let value = this.resolveEntry(symbol, entry, entry.definition, visited)
      let health = entry.health
      if (value === undefined) {
        value = constants.ERROR_WORD
        health = Health.BadlyDefined
      }
      output.set(symbol, { definition: entry.definition, references: entry.references, value, health })
      visited.clear()
    })

    return new Pass2SymbolTable(output)
  }

  private resolveEntry (
    symbol: string, entry: UnresolvedEntry, requester?: AssembledCard, visited?: Set<string>): number | undefined {
    if (typeof entry.value === 'number') {
      return entry.value
    } else {
      const set = visited === undefined ? new Set<string>() : visited
      set.add(symbol)
      return this.resolveField(entry.value, requester, entry.definition, set)
    }
  }

  private resolveField (
    address: field.AddressField,
    owner: AssembledCard | undefined,
    current: AssembledCard,
    visited: Set<string>): number | undefined {
    const resolver = (symbol: string): number | undefined => {
      if (visited.has(symbol)) {
        if (owner !== undefined) {
          getCusses(owner).add(cusses.Cuss35, symbol + ' contains self-reference')
        }
        return undefined
      }
      const entry = this.table.get(symbol)
      if (entry === undefined) {
        if (owner !== undefined) {
          getCusses(owner).add(cusses.Cuss2D, 'No definition for ' + symbol)
        }
        return undefined
      }
      entry.references.push(current)
      return this.resolveEntry(symbol, entry, owner, visited)
    }

    return field.resolvePass1Referenced(address, current.refAddress, owner, resolver)
  }
}

export class Pass2SymbolTable implements SymbolTable {
  private readonly table: Map<string, SymbolEntry>

  constructor (table: Map<string, SymbolEntry>) {
    this.table = table
  }

  resolve (symbol: string, requester: AssembledCard): number | undefined {
    const entry = this.table.get(symbol)
    if (entry === undefined) {
      getCusses(requester).add(cusses.Cuss2C, 'No definition for ' + symbol)
      return undefined
    }

    entry.references.push(requester)
    return entry.value
  }

  print (): void {
    printSymbolTable(this.table)
  }
}
