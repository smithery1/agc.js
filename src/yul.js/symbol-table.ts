import * as field from './address-field'
import { AssembledCard, ERROR_WORD, getCusses } from './assembly'
import * as cusses from './cusses'
import { LocationField } from './parser'

/**
 * The state of a symbol table entry.
 * The abbreviations correspond to observed YUL output in original assembly listings.
 */
export enum Health {
  MultiplyDefined = 'MD',
  BadlyDefined = 'BD',
  Conflict = 'CD',
  MiscTrouble = ' XX'
}

interface UnresolvedEntry {
  readonly definition: AssembledCard
  readonly references: AssembledCard[]
  readonly value: number | field.AddressField
  readonly offset: number
  health?: Health
}

/**
 * An entry for the pass 2 symbol table.
 */
export interface SymbolEntry {
  /**
   * The card defining the symbol.
   */
  readonly definition: AssembledCard
  /**
   * A list of cards referencing the symbol.
   */
  readonly references: AssembledCard[]
  /**
   * The value of the symbol
   */
  readonly value: number
  /**
   * The health of the symbol, if not ok.
   */
  health?: Health
}

/**
 * A read-only symbol table that can resolve a symbol to a value.
 * If the symbol cannot be resolved, an appropriate Cuss is added to the requester and undefined is returned.
 */
export interface SymbolTable {
  resolve: (symbol: string, requester: AssembledCard) => number | undefined
}

/**
 * The pass 1 symbol table gathers symbols but, for the most part, does not attempt to resolve them until pass 1 is
 * complete.
 * Each symbol appears in a location field for either an EQUALS card or some other card.
 * The value of a symbol for an EQUALS card is the operand field of the EQUALS statement.
 * The value of a symbol for another card is the address of the instruction or memory constant location used by the
 * card.
 *
 * This symbol table does not try, except when requested, to resolve the symbol values for the EQUALS symbols.
 * It simple stores the address field for later evaluation.
 *
 * The table can be asked to resolve two particular types of cards, SETLOC and ERASE.
 *
 * The SETLOC card often uses a symbolic address field but per Ref YUL, 13-163 the "symbol must be defined by an earlier
 * card in the deck."
 * So it is safe to evaluate SETLOC symbols during pass 1 and error if they cannot be resolved.
 *
 * The other card is ERASE, which when containing a signed numeric address field advances the location pointer
 * (Ref YUL, 13-168).
 * It is therefore necessary to obtain this value during pass 1.
 * Technically the ERASE card can refer to absolute addresses via an unsigned numeric or symbol address field.
 * We really should resolve only the signed numeric address for ERASE, but the current code we've tested so far does not
 * use absolute addresses so we've punted on that for now.
 */
export class Pass1SymbolTable implements SymbolTable {
  private readonly table = new Map<string, UnresolvedEntry>()

  private requireUnassigned (symbol: string, definition: AssembledCard): void {
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

  /**
   * Adds the symbol in the specified location field to the table, with a resolved value of the address of the specified
   * definition card.
   * If the symbol already exists in the table, a Cuss 31 is added to the definition card, the symbol's health is
   * marked as MultiplyDefined, and the existing definition is replaced with this one.
   * If the definition card has no address, the symbol is given a value of ERROR_WORD and a health of BadlyDefined.
   *
   * @param location the field with the symbol
   * @param definition the card defining the symbol
   */
  assignAddress (location: LocationField | undefined, definition: AssembledCard): void {
    if (location !== undefined) {
      let entry: UnresolvedEntry
      this.requireUnassigned(location.symbol, definition)
      if (definition.refAddress === undefined) {
        entry = { definition, references: [], value: ERROR_WORD, offset: 0, health: Health.BadlyDefined }
      } else {
        entry = { definition, references: [], value: definition.refAddress, offset: 0 }
      }
      this.table.set(location.symbol, entry)
    }
  }

  /**
   * Adds the symbol in the specified location field to the table, associated with the specified address field and
   * with no resolved value.
   * If the symbol already exists in the table, a Cuss 31 is added to the definition card, the symbol's health is
   * marked as MultiplyDefined, and the existing definition is replaced with this one.
   *
   * @param location the field with the symbol
   * @param address the address field of the definition card
   * @param offset an offset to apply to the value when calculating it, used for =MINUS and =PLUS
   * @param definition the card defining the symbol
   */
  assignField (
    location: LocationField | undefined,
    address: field.AddressField | undefined,
    offset: number,
    definition: AssembledCard): void {
    if (location !== undefined && address !== undefined) {
      this.requireUnassigned(location.symbol, definition)
      this.table.set(location.symbol, { definition, references: [], value: address, offset })
    }
  }

  /**
   * Attempts to resolve the specified symbol.
   * If it cannot be resolved, a Cuss 2D is added to the requester and undefined is returned.
   *
   * As noted in the class documentation, this should be used only for SETLOC and limited ERASE cases.
   *
   * @param symbol the symbol to resolve
   * @param requester the card using the symbol in its address field
   * @returns the resolved value
   */
  resolve (symbol: string, requester: AssembledCard): number | undefined {
    const entry = this.table.get(symbol)
    if (entry === undefined) {
      getCusses(requester).add(cusses.Cuss2D, 'No definition for ' + symbol)
      return undefined
    }

    entry.references.push(requester)
    // Do not supply requester, since any cusses added will be added later when we resolve all symbols.
    return this.resolveEntry(symbol, entry)
  }

  /**
   * Attempts to resolve all symbols in the table to their numeric values.
   * This should be called when the symbol table is complete, i.e. after pass 1 is complete.
   * Any symbol that cannot be resolved is associated with a value of ERROR_WORD and a health of BadlyDefined.
   *
   * @returns a new symbol table with all symbols
   */
  resolveAll (): Pass2SymbolTable {
    const visited = new Set<string>()
    const output = new Map<string, SymbolEntry>()
    this.table.forEach((entry: UnresolvedEntry, symbol: string) => {
      let value = this.resolveEntry(symbol, entry, entry.definition, visited)
      let health = entry.health
      if (value === undefined) {
        value = ERROR_WORD
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
      return entry.value + entry.offset
    } else {
      const set = visited === undefined ? new Set<string>() : visited
      set.add(symbol)
      let result = this.resolveField(entry.value, requester, entry.definition, set)
      if (result !== undefined) {
        result += entry.offset
      }
      return result
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

    return field.resolvePass1Reference(address, current.refAddress, owner, resolver)
  }
}

/**
 * The pass 2 symbol table contains all symbols added during pass 1, each associated with either a numeric value or an
 * error condition.
 * For convenience, the error symbols also have a numeric value of ERROR_WORD.
 * This allows assembly to continue, and it is expected that the presence of the error will prevent it from reporting
 * success when done.
 */
export class Pass2SymbolTable implements SymbolTable {
  private readonly table: Map<string, SymbolEntry>

  constructor (table: Map<string, SymbolEntry>) {
    this.table = table
  }

  /**
   * Attempts to resolve the specified symbol.
   * If it is not in the symbol table, a Cuss 2C is added to the requester and undefined is returned.
   * If it is in the symbol table and associated with an error condition, ERROR_WORD is returned.
   *
   * @param symbol the symbol to resolve
   * @param requester the card using the symbol in its address field
   * @returns the resolved value
   */
  resolve (symbol: string, requester: AssembledCard): number | undefined {
    const entry = this.table.get(symbol)
    if (entry === undefined) {
      getCusses(requester).add(cusses.Cuss2C, 'No definition for ' + symbol)
      return undefined
    }

    entry.references.push(requester)
    return entry.value
  }

  /**
   * Provides access to the raw cell data for printing purposes.
   * See print-symbol-table.ts.
   */
  getTable (): Map<string, SymbolEntry> {
    return this.table
  }
}
