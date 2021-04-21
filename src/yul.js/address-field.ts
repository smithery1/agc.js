import { AssembledCard, getCusses } from './assembly'
import * as cusses from './cusses'
import * as ops from './operations'
import { SymbolTable } from './symbol-table'

/**
 * An offset subfield, which represents a signed numeric subfield in the source.
 */
export interface Offset {
  readonly value: number
}

/**
 * An address field, which represents the operand in the source.
 * In addition to the data specified in address-field.ts, contains an optional index register for interpretive
 * operations.
 */
export interface AddressField {
  readonly value: string | number | Offset
  readonly offset?: number
  readonly indexRegister?: number
}

/**
 * A "true address" or "pseudo address" is an actual absolute memory location, range 0 - 117777(8).
 * Address fields eventually resolve to this.
 * Any offset is provided separately for interpretation by the assembler.
 */
export interface TrueAddress {
  readonly address: number
  readonly offset: number
}

export const SIGNED_EXPR = /^[+-]\d+D?$/
export const UNSIGNED_EXPR = /^\d+D?$/

const DECIMAL_INTEGER_EXPR = /^[0-9]+D?$/
const OCTAL_INTEGER_EXPR = /^[0-7]+$/
const ADDRESS_FIELD_EXPR = /^([^\s]+)(?:\s+([+-]\d+D?))?$/
const RANGE_FIELD_EXPR = /^(\d+D?)\s+-\s+(\d+D?)$/
const INDEXED_FIELD_EXPR = /^([^\s,]+)(?:\s+([+-]\d+D?))?(?:,([12]))?$/

const MAX_15_BITS = 0x7FFF

/**
 * Attempts to parse the specified address field.
 *
 * An interpretive indexed field must end with ",[12]".
 * An ERASE or MEMORY field may contain a range of unsigned numbers "[0-9]D? - [0-9]D?".
 *
 * @param field the address field
 * @param interpretiveIndex whether an interpretive index is allowed
 * @param rangeAllowed whether the field may contain a range expression
 * @returns the parsed field or a cuss
 */
export function parse (
  field: string, interpretiveIndex: ops.Necessity, rangeAllowed: boolean, parseCusses: cusses.Cusses):
  AddressField | undefined {
  const match = interpretiveIndex !== ops.Necessity.Never
    ? INDEXED_FIELD_EXPR.exec(field)
    : ADDRESS_FIELD_EXPR.exec(field)
  if (match === null || match[1] === undefined) {
    // If ERASE field does not match standard address form, check for a range.
    if (rangeAllowed) {
      return parseErase(field, parseCusses)
    }
    parseCusses.add(cusses.Cuss3D)
    return undefined
  }

  let offset: number | undefined
  if (match[2] !== undefined) {
    offset = parseSignedOffset(match[2], parseCusses)
    if (offset === undefined) {
      return undefined
    }
  }

  let indexRegister: number | undefined
  if (interpretiveIndex !== ops.Necessity.Never) {
    if (match[3] === undefined) {
      if (interpretiveIndex === ops.Necessity.Required) {
        parseCusses.add(cusses.Cuss17)
        return undefined
      }
    } else {
      indexRegister = Number.parseInt(match[3])
    }
  }

  if (UNSIGNED_EXPR.test(match[1])) {
    const parsed = parseUnsigned(match[1], MAX_15_BITS, parseCusses)
    if (parsed === undefined) {
      return undefined
    }
    return { value: parsed, offset, indexRegister }
  }

  if (SIGNED_EXPR.test(match[1])) {
    const parsed = parseSignedOffset(match[1], parseCusses)
    if (parsed === undefined) {
      return undefined
    }
    return { value: { value: parsed }, offset, indexRegister }
  }

  return { value: match[1], offset, indexRegister }

  function parseErase (field: string, parseCusses: cusses.Cusses): AddressField | undefined {
    const rangeMatch = RANGE_FIELD_EXPR.exec(field)
    if (rangeMatch !== null) {
      const value1 = parseUnsigned(rangeMatch[1], MAX_15_BITS, parseCusses)
      const value2 = parseUnsigned(rangeMatch[2], MAX_15_BITS, parseCusses)
      if (value1 === undefined || value2 === undefined) {
        return undefined
      }

      if (value2 < value1) {
        parseCusses.add(cusses.Cuss1E)
        return undefined
      }
      const offset = value2 - value1
      return { value: value1, offset }
    }

    parseCusses.add(cusses.Cuss3D)
    return undefined
  }

  function parseSignedOffset (signed: string, parseCusses: cusses.Cusses): number | undefined {
    if (!SIGNED_EXPR.test(signed)) {
      parseCusses.add(cusses.Cuss3D)
    }

    const parsed = parseUnsigned(signed.substring(1), MAX_15_BITS, parseCusses)
    if (parsed === undefined) {
      return undefined
    }
    const isNegative = signed.charAt(0) === '-'
    return isNegative ? -parsed : parsed
  }

  function parseUnsigned (input: string, max: number, parseCusses: cusses.Cusses): number | undefined {
    let value: number

    if (OCTAL_INTEGER_EXPR.test(input)) {
      value = Number.parseInt(input, 8)
    } else if (DECIMAL_INTEGER_EXPR.test(input)) {
      if (input.charAt(input.length - 1) === 'D') {
        value = Number.parseInt(input.substring(0, input.length - 1), 10)
      } else {
        // Ref YUL, 13-114. "If a numeric subfield contains character 8 or 9 but no D, it is considered to represent a
        // decimal integer, but a complaint is printed."
        parseCusses.add(cusses.Cuss21)
        value = Number.parseInt(input.substring(0, input.length), 10)
      }
    } else {
      parseCusses.add(cusses.Cuss3D)
      return undefined
    }

    if (value > max) {
      parseCusses.add(cusses.Cuss3F)
      return undefined
    }

    return value
  }
}

/**
 * Resolves the specified address field to a TrueAddress, if possible, using the specified location counter and symbol
 * table if necessary.
 * See parser.ts for information on the contents of the AddressField.
 * See Ref YUL, 13-126 for most of these rules below.
 *
 * 1. If the address field is undefined, i.e. unspecified, the location counter is returned with a 0 offset if defined.
 *    If the location counter is undefined, a Cuss35 is added to the requester and undefined is returned.
 * 2. If the address field consists of an unsigned numeric subfield, its value is returned along with any offset in the
 *    address field.
 * 3. If the address field consists of a symbolic subfield, its value is looked up in the symbol table.
 *    If it does not exist in the symbol table, a Cuss2D is added to the requested and undefined is returned.
 *    Otherwise any offset in the address field is added to the symbol's location, and the result is returned with a 0
 *    offset.
 * 4. If the address field consists of a signed numeric subfield in addition to its offset, the subfield is added to the
 *    location counter (if defined) and the result is returned with the offset in the address field.
 *    If the location counter is undefined, a Cuss35 is added to the requester and undefined is returned.
 *
 * Note the inconsistent treatment of the offset.
 * Ref YUL, 13-126 states "If the address fields contains a numeric and a signed numeric subfield ... the algebraic sum
 * of both is used as the relevant address."
 * Ref SYM, III-3 (published later) states "A symbol followed by a space and then a signed integer is treated by the
 * assembler as if the value of the integer modified the octal instruction (operation code *and* address)."
 * Neither appear to be completely correct.
 * Empirically, the rule seems to be that a numeric and a signed numeric subfield modifies the octal instruction, while
 * a symbolic and a signed numeric subfield modifies only the address.
 *
 * @param address the address field
 * @param locationCounter the location counter for the instruction with the specified address field
 * @param requester the card containing the specified address field
 * @param table the symbol table
 * @returns the true address or undefined
 */
export function resolve (
  address: AddressField | undefined, locationCounter: number | undefined, requester: AssembledCard, table: SymbolTable):
  TrueAddress | undefined {
  if (address === undefined) {
    if (locationCounter === undefined) {
      getCusses(requester).add(cusses.Cuss35)
      return undefined
    }
    return { address: locationCounter, offset: 0 }
  }

  let value: number
  let offset = address.offset ?? 0

  if (typeof address.value === 'number') {
    value = address.value
  } else if (typeof address.value === 'string') {
    const result = table.resolve(address.value, requester)
    if (result === undefined) {
      return undefined
    }
    value = result + offset
    offset = 0
  } else if (locationCounter !== undefined) {
    value = locationCounter + address.value.value
  } else {
    getCusses(requester).add(cusses.Cuss35)
    return undefined
  }

  return { address: value, offset }
}

/**
 * A function that can resolve a specified symbol to a numeric address.
 */
export type Resolver = (symbol: string) => number | undefined

/**
 * Resolves a pass 1 reference to a numeric address.
 * Note that address + offset is not required here, as it is for the resolve function above.
 * Anything referenced as a symbol must resolve to a single numeric address, so any offset is simply added to the
 * address.
 * Called by the symbol tables with resolvers appropriate to pass 1 or pass 2.
 *
 * @param address the address field
 * @param locationCounter the location counter for the instruction with the specified address field
 * @param requester the card containing the specified address field
 * @param resolver the resolved for symbols to locations
 * @returns the true address or undefined
 */
export function resolvePass1Reference (
  address: AddressField, locationCounter: number | undefined, requester: AssembledCard | undefined, resolver: Resolver):
  number | undefined {
  let value: number

  if (typeof address.value === 'number') {
    value = address.value
  } else if (typeof address.value === 'string') {
    const result = resolver(address.value)
    if (result === undefined) {
      return undefined
    }
    value = result
  } else if (address.value === undefined) {
    value = 0
  } else if (locationCounter !== undefined) {
    value = locationCounter + address.value.value
  } else {
    if (requester !== undefined) {
      getCusses(requester).add(cusses.Cuss35, 'No location counter for offset')
    }
    return undefined
  }

  return value + (address.offset ?? 0)
}
