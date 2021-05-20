//
// This file contains definitions for all the operation codes.
// The various documentation sources were written at different times and disagree on some particulars.
// Where those particulars might be important, they are mentioned in comments.
// The general rule here is that if an operation is in the documentation but not in any of the code, it is not
// implemented.
//

import { Options } from './options'

/**
 * The requirements for the presence of field.
 */
export enum Necessity {
  Never,
  Optional,
  Required,
}

/**
 * Operation classification.
 */
export enum Type {
  Address,
  Basic,
  Clerical,
  Interpretive,
  Numeric
}

/**
 * An operation.
 */
export interface BaseOperation {
  readonly type: Type
  readonly symbol: string
  readonly words: number
}

/**
 * Address constant card operations.
 *
 * Ref YUL, 13-134 "Address Constant Cards"
 */
export interface AddressConstant extends BaseOperation {
  /**
    * Whether this constant requires an address field.
    */
  readonly addressField: Necessity
}

/**
 * The allowable values for a basic opcode address field.
 */
export enum BasicAddressRange {
  ErasableMemory,
  FixedMemory,
  AnyMemory,
  IOChannel
}

/**
 * Instruction card basic operations.
 *
 * Ref YUL, 13-115 "Instruction Cards"
 */
export interface Basic extends BaseOperation {
  /**
   * If this is an extended instruction.
   */
  readonly isExtended: boolean
  /**
   * Whether this instruction requires an address field.
   */
  readonly addressField: Necessity
  /**
   * The op code for this instruction.
   */
  readonly opCode: number
  /**
   * The quarter code for this instruction, if it uses one.
   */
  readonly qc?: number
  /**
   * If an address field is used, the allowable values for the address field.
   */
  readonly addressRange?: BasicAddressRange
  /**
   * Whether the operator uses a special fixed address.
   * E.g. TC 6 for EXTEND.
   */
  readonly specialAddress?: number
  /**
   * A bias value to be applied to any address for this instruction.
   * E.g. 1 for DDOUBL
   */
  readonly addressBias?: number
}

/**
 * Clerical card operations
 *
 * Ref YUL, 13-154 "Clerical Cards"
 *
 * There are a handful of codes referred to in Ref YUL but that do not appear in the source (yet), such as HEAD, TAIL,
 * and MEMORY.
 * They are not supported here.
 */
export interface Clerical extends BaseOperation {
  readonly locationField: Necessity
  readonly addressField: Necessity
  readonly complement: Necessity
  readonly index: Necessity
}

/**
 * Numeric constant card operations.
 *
 * Ref YUL, 13-139 "Numeric Constant Cards"
 */
export interface NumericConstant extends BaseOperation {
}

/**
 * Whether an interpretive operand references the contents of an address or a numeric constant.
 */
export enum InterpretiveOperandType {
  Address,
  Constant
}

/**
 * The type of an interpretive operand.
 *
 * Ref SYM, VIB-1
 */
export enum InterpretiveType {
  Indexable,
  Misc,
  Logical,
  Shift,
  Store,
  Unary
}

/**
 * An interpretive operand.
 *
 * The various fields are from the table in Ref BTM, 2-12 - 2-17.
 */
export interface InterpretiveOperand {
  readonly type: InterpretiveOperandType
  readonly pushDown: boolean
  readonly indexable: boolean
  readonly indirect: boolean
  readonly erasableMemory: boolean
  readonly fixedMemory: boolean
}

/**
 * Instruction card interpretive operations.
 *
 * Ref YUL, 13-115 "Instruction Cards"
 */
export interface Interpretive extends BaseOperation {
  readonly subType: InterpretiveType
  readonly rhs: boolean
  readonly opCode?: number
  readonly code?: number
  readonly operand1?: InterpretiveOperand
  readonly operand2?: InterpretiveOperand
}

/**
 * The operation union type.
 */
export type Operation = AddressConstant | Basic | Clerical | NumericConstant | Interpretive

function IO (
  type: InterpretiveOperandType,
  pushDown: boolean,
  indexable: boolean,
  indirect: boolean,
  erasableMemory: boolean,
  fixedMemory: boolean):
  InterpretiveOperand {
  const IO = function (
    type: InterpretiveOperandType,
    pushDown: boolean,
    indexable: boolean,
    indirect: boolean,
    erasableMemory: boolean,
    fixedMemory: boolean):
    void {
    this.type = type
    this.pushDown = pushDown
    this.indexable = indexable
    this.indirect = indirect
    this.erasableMemory = erasableMemory
    this.fixedMemory = fixedMemory
  }
  return new IO(type, pushDown, indexable, indirect, erasableMemory, fixedMemory)
}

/**
 * Creates and returns an Operations instance appropriate for the assembler type in the specified options.
 *
 * @param options the assembler options
 * @returns the Operations instance
 */
export function createOperations (options: Options): Operations {
  if (options.source.isBlock1()) {
    return new Block1Operations()
  }
  return options.source.isBlk2() ? new Blk2Operations() : new AgcOperations()
}

// Ref SYM, VIB-50 prefix 2, selection code 34
const INTERPRETIVE_OPCODE_LOGICAL = 114
// Ref SYM, VIB-26 prefix 1, selection code 23
const INTERPRETIVE_OPCODE_SHIFT = 77
// Ref SUNRISE, RTB ROUTINES, page 99-100
// These are the routines that manipulate the accumulator.
// SIGNMPAC isn't documented there but belongs in this list.
const RTB_IMPLICIT_LOAD_ROUTINES: string[] = [
  'LOADTIME',
  'CDULOGIC',
  '1STO2S',
  'READPIPS',
  'SGNAGREE',
  'SIGNMPAC',
  'TRUNLOG'
]

export function isBlock1RtbLoad (routine: string): boolean {
  return RTB_IMPLICIT_LOAD_ROUTINES.includes(routine)
}

/**
 * Container of information about all assembly operations available for a particular assembler type.
 *
 * The user of the class must be aware of the existence of variations in operations across assembler types in most
 * cases, but this class provides general functions that insulate the user from the particulars of those variations.
 * Provides lookup of an operation from its symbol and access to most operations by name at compile time.
 */
export abstract class Operations {
  private readonly ops = new Map<string, BaseOperation>()

  readonly BNKSUM: Clerical
  readonly NOOP_FIXED: Basic
  readonly NOOP_ERASABLE: Basic

  constructor () {
    //
    // Clerical
    //
    // Note erase can be 0 or 1 words, depending on the address field.
    // This is handled in the assembler, but the parser needs it to be non-zero to perform other checks.
    this.addClerical('ERASE', 1, Necessity.Optional, Necessity.Optional, Necessity.Never, Necessity.Never)
    this.addClerical('BANK', 0, Necessity.Never, Necessity.Optional, Necessity.Never, Necessity.Never)
    this.BNKSUM = this.addClerical('BNKSUM', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Never)
    this.addClerical('EQUALS', 0, Necessity.Optional, Necessity.Optional, Necessity.Never, Necessity.Never)
    this.alias('EQUALS', '=')
    this.addClerical('SETLOC', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Never)
    this.alias('SETLOC', 'LOC')
    this.addClerical('SUBRO', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Never)

    //
    // Numeric
    //
    this.addNumeric('2DEC', 2)
    this.addNumeric('2OCT', 2)
    this.alias('2OCT', '2OCTAL')
    this.addNumeric('DEC', 1)
    this.addNumeric('OCT', 1)
    this.alias('OCT', 'OCTAL')
    this.addNumeric('MM', 1)
    this.addNumeric('VN', 1)
    this.alias('VN', 'NV')
  }

  /**
   * Returns the operation for the specified symbol.
   * Returns undefined if no operation has the specified symbol name.
   *
   * @param symbol the symbol to look up
   * @returns the operation for the specified symbol
   */
  operation (symbol: string): Operation | undefined {
    return this.ops.get(symbol)
  }

  /**
   * Returns the address constant operation for TC operations that preceded the checksum value.
   * YUL/GAP output these as constants in the octal listing, so we assemble them as if they came from an address
   * constant card instead of from an instruction card.
   *
   * @returns the address constant operation for TC operations that preceded the checksum value
   */
  abstract checksumTcConstant (): AddressConstant

  /**
   * Returns the extended form of the INDEX operation if op is INDEX and extended is true, otherwise returns op.
   *
   * @param op the operation to check
   * @param extended whether preceded by an EXTEND instruction
   * @returns the extended form of the INDEX operation if op is INDEX and extended is true, otherwise returns op
   */
  abstract checkExtendedIndex (op: Operation, extended: boolean): Operation

  /**
   * Returns true iff the op is the basic or extended variant of INDEX.
   *
   * @param op the operation to check
   * @returns true iff the op is the basic or extended variant of INDEX
   */
  abstract isIndex (op: Operation): boolean

  /**
   * Returns true iff the op is EXTEND or the extended variant of INDEX.
   *
   * @param op the operation to check
   * @returns true iff the op is EXTEND or the extended variant of INDEX
   */
  abstract isExtend (op: Operation): boolean

  /**
   * Returns the indexed form of the specified store instruction if op is a store instruction and indexed is true.
   * Otherwise returns op.
   *
   * @param op the operation to check
   * @param indexed whether the operation is indexed
   * @returns the indexed form of the specified store instruction if op is a store instruction and indexed is true
   */
  abstract checkIndexedStore (op: Operation, indexed: boolean): Operation

  /**
   * Returns Necessity.Optional if op is a store instruction whose first IAW can be indexed, otherwise returns
   * Necessity.Never.
   *
   * @param op the operation to check
   * @returns Necessity.Optional if op is a store instruction whose first IAW can be indexed, otherwise returns
   *   Necessity.Never.
   */
  abstract storeFirstWordIndexable (op: Operation): Necessity

  /**
   * Returns the store operation for an indexed first word if relevant to the specified operation.
   * Otherwise returns op.
   *
   * @param op the operation to check
   * @param index the index (1 or 2)
   * @returns the store operation for an indexed first word if relevant to the specified operation
   */
  abstract storeFirstWordIndexed (op: Interpretive, index: number): Interpretive

  protected add<Type extends BaseOperation> (symbol: string, op: Type): Type {
    if (this.ops.has(symbol)) {
      throw new Error('duplicate symbol: ' + symbol)
    }
    this.ops.set(symbol, op)
    return op
  }

  protected addClerical (
    symbol: string, words: number,
    locationField: Necessity, addressField: Necessity, complement: Necessity, index: Necessity): Clerical {
    const op = { type: Type.Clerical, symbol, words, locationField, addressField, complement, index }
    return this.add(symbol, op)
  }

  protected addAddress (symbol: string, words: number, addressField: Necessity): AddressConstant {
    const op = { type: Type.Address, symbol, words, addressField }
    return this.add(symbol, op)
  }

  protected addBasicQc (symbol: string, opCode: number, qc: number, addressBias?: number): Basic {
    return this.addBasicExtended(false, symbol, opCode, qc, BasicAddressRange.ErasableMemory, addressBias)
  }

  protected addBasic (symbol: string, opCode: number, addressRange: BasicAddressRange, addressBias?: number): Basic {
    return this.addBasicExtended(false, symbol, opCode, undefined, addressRange, addressBias)
  }

  protected addBasicSpecial (symbol: string, opCode: number, specialAddress: number): Basic {
    const op = {
      type: Type.Basic, symbol, isExtended: false, opCode, specialAddress, addressField: Necessity.Never, words: 1
    }
    return this.add(symbol, op)
  }

  protected addBasicQcSpecial (symbol: string, opCode: number, qc: number, specialAddress: number): Basic {
    const op = {
      type: Type.Basic, symbol, isExtended: false, opCode, qc, specialAddress, addressField: Necessity.Never, words: 1
    }
    return this.add(symbol, op)
  }

  protected addExtendedQc (symbol: string, opCode: number, qc: number, addressBias?: number): Basic {
    return this.addBasicExtended(true, symbol, opCode, qc, BasicAddressRange.ErasableMemory, addressBias)
  }

  protected addExtended (symbol: string, opCode: number, addressRange: BasicAddressRange, addressBias?: number): Basic {
    return this.addBasicExtended(true, symbol, opCode, undefined, addressRange, addressBias)
  }

  protected addExtendedSpecial (symbol: string, opCode: number, specialAddress: number): Basic {
    const op = {
      type: Type.Basic, symbol, isExtended: true, opCode, specialAddress, addressField: Necessity.Never, words: 1
    }
    return this.add(symbol, op)
  }

  protected addExtendedQcSpecial (symbol: string, opCode: number, qc: number, specialAddress: number): Basic {
    const op = {
      type: Type.Basic, symbol, isExtended: true, opCode, qc, specialAddress, addressField: Necessity.Never, words: 1
    }
    return this.add(symbol, op)
  }

  protected addExtendedIO (symbol: string, pc: number): Basic {
    const op = {
      type: Type.Basic,
      symbol,
      isExtended: true,
      opCode: 0,
      qc: pc,
      addressRange: BasicAddressRange.IOChannel,
      addressField: Necessity.Required,
      words: 1
    }
    return this.add(symbol, op)
  }

  protected createBasicExtended (
    isExtended: boolean,
    symbol: string,
    opCode: number,
    qc: number | undefined,
    addressRange: BasicAddressRange,
    addressBias?: number):
    Basic {
    return {
      type: Type.Basic,
      symbol,
      isExtended,
      opCode,
      qc: qc,
      addressRange,
      addressBias,
      addressField: Necessity.Optional,
      words: 1
    }
  }

  protected addBasicExtended (
    isExtended: boolean,
    symbol: string,
    opCode: number,
    qc: number | undefined,
    addressRange: BasicAddressRange,
    addressBias?: number):
    Basic {
    const op = this.createBasicExtended(
      isExtended, symbol, opCode, qc, addressRange, addressBias)
    return this.add(symbol, op)
  }

  protected createFullInterpretive (
    symbol: string,
    opCode: number | undefined,
    otherCodeOctal: string | undefined,
    subType: InterpretiveType,
    rhs: boolean,
    operand1?: InterpretiveOperand,
    operand2?: InterpretiveOperand): Interpretive {
    const otherCode = otherCodeOctal === undefined ? undefined : Number.parseInt(otherCodeOctal, 8)
    return { type: Type.Interpretive, subType, rhs, symbol, opCode, code: otherCode, words: 1, operand1, operand2 }
  }

  protected addNumeric (symbol: string, words: number): NumericConstant {
    const op = { type: Type.Numeric, symbol, words }
    return this.add(symbol, op)
  }

  protected alias (original: string, alias: string): void {
    const op = this.ops.get(original)
    if (op === undefined) {
      throw new Error('unknown symbol to alias: ' + original)
    }
    if (this.ops.has(alias)) {
      throw new Error('duplicate symbol as alias: ' + alias)
    }
    this.ops.set(alias, op)
  }
}

class Block1Operations extends Operations {
  private readonly XCADR: AddressConstant
  private readonly EXTEND: Basic
  private readonly INDEX: Basic
  private readonly EXTENDED_INDEX: Basic
  private readonly STORE: Interpretive
  private readonly STORE_INDEX: Interpretive

  constructor () {
    super()

    //
    // Address
    //
    this.addAddress('ADRES', 1, Necessity.Optional)
    this.addAddress('CADR', 1, Necessity.Optional)
    this.XCADR = this.addAddress('XCADR', 1, Necessity.Optional)
    this.addAddress('P', 1, Necessity.Required)
    this.alias('P', '')

    //
    // Basic
    //
    this.addBasic('TC', 0, BasicAddressRange.AnyMemory)
    this.alias('TC', '0')
    this.alias('TC', 'TCR')
    this.addBasicSpecial('RELINT', 2, 14)
    this.addBasicSpecial('INHINT', 2, 15)
    this.addBasicSpecial('RESUME', 2, 21)
    this.EXTEND = this.addBasicSpecial('EXTEND', 2, 0xBFF)
    this.addBasic('CCS', 1, BasicAddressRange.ErasableMemory)
    this.alias('CCS', '1')
    this.addBasic('CAF', 3, BasicAddressRange.FixedMemory)
    this.alias('CAF', '3')
    this.addBasic('CS', 4, BasicAddressRange.AnyMemory)
    this.alias('CS', '4')
    this.addBasic('TS', 5, BasicAddressRange.ErasableMemory)
    this.alias('TS', '5')
    // See Solarium055 P39 where an INDEX is treated as extended without an EXTEND.
    // Just define a single INDEX that can reference any memory.
    this.INDEX = this.addBasic('INDEX', 2, BasicAddressRange.AnyMemory)
    this.alias('INDEX', '2')
    this.alias('INDEX', 'NDX')
    this.addBasic('XCH', 3, BasicAddressRange.AnyMemory)
    this.addBasicSpecial('XAQ', 0, 0)
    this.addBasic('AD', 6, BasicAddressRange.AnyMemory)
    this.alias('AD', '6')
    this.addBasic('MASK', 7, BasicAddressRange.AnyMemory)
    this.alias('MASK', '7')
    this.alias('MASK', 'MSK')
    // Block1 uses only Block2 "erasable" NOOP, equivalent to CA A (30000).
    // REF BTM, Figure 7, page 1-45
    this.addBasicSpecial('NOOP', 3, 0)
    // Implied Address Codes
    this.addBasicSpecial('COM', 4, 0)
    this.addBasicSpecial('DOUBLE', 6, 0)
    this.addBasicSpecial('OVSK', 5, 0)

    //
    // Extended
    //
    this.addExtended('MP', 4, BasicAddressRange.AnyMemory)
    this.addExtended('DV', 5, BasicAddressRange.AnyMemory)
    this.addExtended('SU', 6, BasicAddressRange.AnyMemory)
    this.addExtendedSpecial('SQUARE', 4, 0)

    //
    // Interpreter
    //
    // Data mostly from Ref SUNRISE and the INTERPRETER_SECTION source files.
    // Ref SUNRISE page 15 refers to grouping operation codes by prefix, but that organization isn't used here.
    //

    // DP binary with implicit load and implicit store
    this.addInterpretiveIndexable('DAD', '34', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('DSU', '44', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('BDSU', '50', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('DMP', '54', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('DMPR', '110', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('DDV', '64', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('BDDV', '70', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('TSRT', '104', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('TSLT', '60', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('TSLC', '100', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('SIGN', '120', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.alias('SIGN', 'SGN')

    // DP unary with implicit load and implicit store
    this.addInterpretiveIndexable('SIN', '103', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('COS', '113', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('ASIN', '63', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('ACOS', '73', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('SQRT', '123', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('DSQ', '133', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('DMOVE', '153', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('ABS', '53', IO(InterpretiveOperandType.Address, true, true, false, true, true))

    // DP binary with implicit load and only explicit store
    this.addInterpretiveIndexable('BPL', '160', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('BZE', '140', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('BMN', '20', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('BHIZ', '40', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))

    // Vector binary with implicit load and implicit store
    this.addInterpretiveIndexable('VAD', '134', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('VSU', '14', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('BVSU', '144', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('VXV', '170', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('MXV', '124', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('VXM', '130', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('VPROJ', '174', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('VSLT', '154', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('VSRT', '150', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))

    // Vector unary with implicit load and implicit store
    this.addInterpretiveIndexable('UNIT', '23', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('VMOVE', '13', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('ABVAL', '33', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('VSQ', '43', IO(InterpretiveOperandType.Address, true, true, false, true, true))

    // "Binary" with only explicit load and only explicit store
    // Documented and treated as binary for indexing purposes, but only seem to take a single IAW
    this.addInterpretiveIndexableRhs('ITC', '4', IO(InterpretiveOperandType.Address, false, true, false, false, true))
    this.addInterpretiveIndexable('BOV', '30', IO(InterpretiveOperandType.Address, false, true, false, true, true))
    this.addInterpretiveIndexable('STZ', '24', IO(InterpretiveOperandType.Address, false, true, false, true, false))

    // TP binary with implicit load and implicit store
    this.addInterpretiveIndexable('TAD', '74', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('TSU', '114', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))

    // TP unary with implicit load and implicit store
    this.addInterpretiveIndexable('TMOVE', '3', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('TP', '3', IO(InterpretiveOperandType.Address, true, true, false, true, true))

    // Misc binary
    this.addInterpretiveIndexable('VXSC', '10', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('DOT', '164', IO(InterpretiveOperandType.Address, true, true, false, true, true), IO(InterpretiveOperandType.Address, true, true, false, true, true))

    // Misc unary
    this.addInterpretiveIndexable('COMP', '143', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveMisc('ROUND', '145')
    this.addInterpretiveIndexable('VDEF', '173', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('SMOVE', '163', IO(InterpretiveOperandType.Address, true, true, false, true, true))

    // Misc non-indexable with only explicit load and only explicit store
    this.addInterpretiveMiscRhs('EXIT', '1')
    this.addInterpretiveMisc('RTB', '5', IO(InterpretiveOperandType.Address, false, false, false, false, true))
    this.addInterpretiveMisc('AXT,1', '11', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('AXT,2', '15', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('AXC,1', '121', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('AXC,2', '125', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('LXA,1', '21', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('LXA,2', '25', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('LXC,1', '31', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('LXC,2', '35', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('SXA,1', '41', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('SXA,2', '45', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('XCHX,1', '51', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('XCHX,2', '55', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('INCR,1', '61', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('INCR,2', '65', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('XAD,1', '71', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('XAD,2', '75', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('XSU,1', '101', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('XSU,2', '105', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('AST,1', '111', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('AST,2', '115', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('TIX,1', '131', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('TIX,2', '135', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('NOLOD', '141')
    this.addInterpretiveMisc('ITA', '151', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('ITCI', '155', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('SWITCH', '165', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('TEST', '161', IO(InterpretiveOperandType.Address, false, false, false, true, true), IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('LODON', '171')
    this.addInterpretiveMiscRhs('ITCQ', '175')
    this.STORE = this.addInterpretiveStore('STORE', '15', IO(InterpretiveOperandType.Address, false, true, false, true, false))
    this.STORE_INDEX = this.createInterpretiveStore('STORE', '7', IO(InterpretiveOperandType.Address, false, true, false, true, false))
  }

  protected addInterpretive1 (
    symbol: string,
    opCode: number,
    subType: InterpretiveType,
    rhs: boolean,
    operand1?: InterpretiveOperand,
    operand2?: InterpretiveOperand):
    Interpretive {
    const op = this.createFullInterpretive(symbol, opCode, undefined, subType, rhs, operand1, operand2)
    return this.add(symbol, op)
  }

  protected addInterpretiveIndexable (
    symbol: string, selectionCodeOctal: string, operand1: InterpretiveOperand, operand2?: InterpretiveOperand):
    Interpretive {
    const opCode = Number.parseInt(selectionCodeOctal, 8)
    return this.addInterpretive1(symbol, opCode, InterpretiveType.Indexable, false, operand1, operand2)
  }

  protected addInterpretiveIndexableRhs (
    symbol: string, selectionCodeOctal: string, operand1: InterpretiveOperand, operand2?: InterpretiveOperand):
    Interpretive {
    const opCode = Number.parseInt(selectionCodeOctal, 8)
    return this.addInterpretive1(symbol, opCode, InterpretiveType.Indexable, true, operand1, operand2)
  }

  protected addInterpretiveMisc (
    symbol: string, selectionCodeOctal: string, operand1?: InterpretiveOperand, operand2?: InterpretiveOperand):
    Interpretive {
    const opCode = Number.parseInt(selectionCodeOctal, 8)
    return this.addInterpretive1(symbol, opCode, InterpretiveType.Misc, false, operand1, operand2)
  }

  protected addInterpretiveMiscRhs (
    symbol: string, selectionCodeOctal: string, operand1?: InterpretiveOperand): Interpretive {
    const opCode = Number.parseInt(selectionCodeOctal, 8)
    return this.addInterpretive1(symbol, opCode, InterpretiveType.Misc, true, operand1)
  }

  protected addInterpretiveStore (
    symbol: string, selectionCodeOctal: string, operand1: InterpretiveOperand): Interpretive {
    const op = this.createInterpretiveStore(symbol, selectionCodeOctal, operand1)
    return this.add(symbol, op)
  }

  protected createInterpretiveStore (
    symbol: string, selectionCodeOctal: string, operand1: InterpretiveOperand): Interpretive {
    const op = this.createFullInterpretive(
      symbol, undefined, selectionCodeOctal, InterpretiveType.Store, false, operand1)
    return op
  }

  checksumTcConstant (): AddressConstant {
    return this.XCADR
  }

  checkExtendedIndex (op: Operation, extended: boolean): Operation {
    return extended && op === this.INDEX ? this.EXTENDED_INDEX : op
  }

  isIndex (op: Operation): boolean {
    return op === this.INDEX || op === this.EXTENDED_INDEX
  }

  isExtend (op: Operation): boolean {
    return op === this.EXTEND || op === this.EXTENDED_INDEX
  }

  checkIndexedStore (op: Operation, indexed: boolean): Operation {
    return op
  }

  storeFirstWordIndexable (op: Operation): Necessity {
    if (op.type === Type.Interpretive) {
      const inter = op as Interpretive
      return inter === this.STORE ? Necessity.Optional : Necessity.Never
    }
    return Necessity.Never
  }

  storeFirstWordIndexed (op: Interpretive, index: number): Interpretive {
    if (op === this.STORE) {
      return this.STORE_INDEX
    } else {
      return op
    }
  }
}

abstract class Block2Operations extends Operations {
  private readonly GENADR: AddressConstant
  private readonly EXTEND: Basic
  private readonly INDEX: Basic
  private readonly EXTENDED_INDEX: Basic
  protected readonly STORE: Interpretive
  protected readonly STORE_INDEX_1: Interpretive
  protected readonly STORE_INDEX_2: Interpretive

  constructor () {
    super()

    //
    // Clerical
    //
    this.addClerical('=ECADR', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Never)
    this.addClerical('=MINUS', 0, Necessity.Required, Necessity.Required, Necessity.Never, Necessity.Never)
    this.addClerical('=PLUS', 0, Necessity.Required, Necessity.Required, Necessity.Never, Necessity.Never)
    this.addClerical('CHECK=', 0, Necessity.Required, Necessity.Required, Necessity.Never, Necessity.Never)
    this.addClerical('BLOCK', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Never)
    this.addClerical('COUNT', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Optional)
    this.addClerical('EBANK=', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Required)
    this.addClerical('MEMORY', 0, Necessity.Required, Necessity.Required, Necessity.Never, Necessity.Never)
    this.addClerical('SBANK=', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Never)

    //
    // Address
    //
    this.addAddress('2CADR', 2, Necessity.Required)
    this.alias('2CADR', '2BCADR')
    this.addAddress('2FCADR', 2, Necessity.Required)
    this.addAddress('ADRES', 1, Necessity.Optional)
    this.addAddress('BBCON', 1, Necessity.Optional)
    this.addAddress('CADR', 1, Necessity.Optional)
    this.alias('CADR', 'FCADR')
    this.addAddress('ECADR', 1, Necessity.Required)
    this.GENADR = this.addAddress('GENADR', 1, Necessity.Optional)
    this.addAddress('P', 1, Necessity.Required)
    this.alias('P', '')
    this.addAddress('REMADR', 1, Necessity.Required)
    // Telemetry downlist: Ref SYM, VC-1 & VC-3
    this.addAddress('DNCHAN', 1, Necessity.Required)
    this.addAddress('DNPTR', 1, Necessity.Required)
    this.addAddress('1DNADR', 1, Necessity.Required)
    this.addAddress('2DNADR', 1, Necessity.Required)
    this.addAddress('3DNADR', 1, Necessity.Required)
    this.addAddress('4DNADR', 1, Necessity.Required)
    this.addAddress('5DNADR', 1, Necessity.Required)
    this.addAddress('6DNADR', 1, Necessity.Required)

    //
    // Basic
    //
    this.addBasic('TC', 0, BasicAddressRange.AnyMemory)
    this.alias('TC', '0')
    this.alias('TC', 'TCR')
    this.addBasicSpecial('RELINT', 0, 3)
    this.addBasicSpecial('INHINT', 0, 4)
    this.EXTEND = this.addBasicSpecial('EXTEND', 0, 6)
    this.addBasicQc('CCS', 1, 0)
    this.alias('CCS', '1')
    this.addBasic('TCF', 1, BasicAddressRange.FixedMemory)
    this.addBasicQc('DAS', 2, 0, 1)
    this.alias('DAS', '2')
    this.addBasicQc('LXCH', 2, 1)
    this.addBasicQc('INCR', 2, 2)
    this.addBasicQc('ADS', 2, 3)
    this.addBasic('CA', 3, BasicAddressRange.AnyMemory)
    this.alias('CA', '3')
    this.addBasic('CAE', 3, BasicAddressRange.ErasableMemory)
    this.addBasic('CAF', 3, BasicAddressRange.FixedMemory)
    this.addBasic('CS', 4, BasicAddressRange.AnyMemory)
    this.alias('CS', '4')
    this.addBasicQc('TS', 5, 2)
    // There are two INDEXES, one basic and one extended.
    // This is the basic one.
    this.INDEX = this.addBasicQc('INDEX', 5, 0)
    // This is the extended one.
    this.EXTENDED_INDEX = this.createBasicExtended(true, 'INDEX', 5, 0, BasicAddressRange.AnyMemory, undefined)
    this.alias('INDEX', '5')
    this.alias('INDEX', 'NDX')
    this.addBasicSpecial('RESUME', 5, 15)
    this.addBasicQc('DXCH', 5, 1, 1)
    this.addBasicQc('XCH', 5, 3)
    this.addBasic('AD', 6, BasicAddressRange.AnyMemory)
    this.alias('AD', '6')
    this.addBasic('MASK', 7, BasicAddressRange.AnyMemory)
    this.alias('MASK', '7')
    this.alias('MASK', 'MSK')
    // Implied Address Codes
    this.addBasicSpecial('COM', 4, 0)
    this.addBasicQcSpecial('DDOUBL', 2, 0, 1)
    this.addBasicSpecial('DOUBLE', 6, 0)
    this.addBasicQcSpecial('DTCB', 5, 1, 6)
    this.addBasicQcSpecial('DTCF', 5, 1, 5)
    // There are two NOOP opcodes, one if in fixed memory and one if in erasable memory.
    // The erasable one is equivalent to CA A (30000).
    // The fixed one, given here, is equivalent to TCF (I + 1).
    // REF BTM, Figure 7, page 1-45
    this.addBasic('NOOP', 1, BasicAddressRange.FixedMemory, 1)
    this.addBasicQcSpecial('OVSK', 5, 2, 0)
    this.addBasicSpecial('RETURN', 0, 2)
    this.addBasicQcSpecial('TCAA', 5, 2, 5)
    this.addBasicSpecial('XLQ', 0, 1)
    this.addBasicSpecial('XXALQ', 0, 0)
    this.addBasicQcSpecial('ZL', 2, 1, 7)

    //
    // Extended
    //
    this.addExtendedIO('READ', 0)
    this.addExtendedIO('WRITE', 1)
    this.addExtendedIO('RAND', 2)
    this.addExtendedIO('WAND', 3)
    this.addExtendedIO('ROR', 4)
    this.addExtendedIO('WOR', 5)
    this.addExtendedIO('RXOR', 6)

    this.addExtended('EDRUPT', 0, BasicAddressRange.FixedMemory)
    this.addExtendedQc('DV', 1, 0)
    this.addExtended('BZF', 1, BasicAddressRange.FixedMemory)
    this.addExtendedQc('MSU', 2, 0)
    this.addExtendedQc('QXCH', 2, 1)
    this.addExtendedQc('AUG', 2, 2)
    this.addExtendedQc('DIM', 2, 3)
    this.addExtended('DCA', 3, BasicAddressRange.AnyMemory, 1)
    this.addExtended('DCS', 4, BasicAddressRange.AnyMemory, 1)
    this.addExtendedQc('SU', 6, 0)
    this.addExtended('BZMF', 6, BasicAddressRange.FixedMemory)
    this.addExtended('MP', 7, BasicAddressRange.AnyMemory)
    // Implied Address Codes
    this.addExtendedSpecial('DCOM', 4, 1)
    this.addExtendedSpecial('SQUARE', 7, 0)
    this.addExtendedQcSpecial('ZQ', 2, 1, 7)

    //
    // Interpreter
    //
    // Data mostly from tables in Ref BTM, 2-12 - 2-17 but this document predates certain interpreter features such as 12
    // bit store addresses, and so the data needs to be adjusted in some cases.
    // CCALL, CGOTO, PUSHD, SIGN: should be "push", verified from Luminary099 INTERPRETER page 1011
    // PDVL: should not be "push" per Ref BTM, but seems to be used that way
    // SIGN: indexable and applies to fixed mem per Ref SYM, VIB-11
    // NORM: indexable per Ref SYM, VB-26
    //

    // Scalar computations
    // Ref SYM VIB-3 - VIB-14
    this.addInterpretiveUnary('ABS', '26')
    this.addInterpretiveUnary('ACOS', '12')
    this.alias('ACOS', 'ARCCOS')
    this.addInterpretiveUnary('ASIN', '10')
    this.alias('ASIN', 'ARCSIN')
    this.addInterpretiveIndexable('BDDV', '22', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('BDSU', '33', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveUnary('COS', '6')
    this.alias('COS', 'COSINE')
    this.addInterpretiveIndexable('DAD', '34', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveUnary('DCOMP', '20')
    this.addInterpretiveIndexable('DDV', '21', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('DMP', '36', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('DMPR', '20', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveUnary('DSQ', '14')
    this.addInterpretiveIndexable('DSU', '32', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveUnary('ROUND', '16')
    this.addInterpretiveIndexable('SIGN', '2', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveUnary('SIN', '4')
    this.alias('SIN', 'SINE')
    this.addInterpretiveUnary('SQRT', '2')
    this.addInterpretiveIndexable('TAD', '1', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    // Vector computations
    // Ref SYM VIB-15 - VIB-25
    this.addInterpretiveUnary('ABVAL', '26')
    this.addInterpretiveIndexable('BVSU', '26', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('DOT', '27', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('MXV', '13', IO(InterpretiveOperandType.Address, false, true, false, true, true))
    this.addInterpretiveUnary('UNIT', '24')
    this.addInterpretiveIndexable('VAD', '24', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveUnary('VCOMP', '20')
    this.addInterpretiveUnary('VDEF', '22')
    this.addInterpretiveIndexable('VPROJ', '31', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveUnary('VSQ', '30')
    this.addInterpretiveIndexable('VSU', '25', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('VXM', '16', IO(InterpretiveOperandType.Address, false, true, false, true, true))
    this.addInterpretiveIndexable('VXSC', '3', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('VXV', '30', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('V/SC', '7', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    // Shifting operations
    // Ref SYM VIB-26 - VIB-34
    this.addInterpretiveIndexable('NORM', '17', IO(InterpretiveOperandType.Address, false, true, false, true, false))
    this.alias('NORM', 'SLC')
    this.addInterpretiveShift('SL', '0', IO(InterpretiveOperandType.Constant, false, true, false, false, false))
    this.addInterpretiveUnary('SL1', '5')
    this.addInterpretiveUnary('SL2', '15')
    this.addInterpretiveUnary('SL3', '25')
    this.addInterpretiveUnary('SL4', '35')
    this.addInterpretiveShift('SLR', '2', IO(InterpretiveOperandType.Constant, false, true, false, false, false))
    this.addInterpretiveUnary('SL1R', '1')
    this.addInterpretiveUnary('SL2R', '11')
    this.addInterpretiveUnary('SL3R', '21')
    this.addInterpretiveUnary('SL4R', '31')
    this.addInterpretiveShift('SR', '1', IO(InterpretiveOperandType.Constant, false, true, false, false, false))
    this.addInterpretiveUnary('SR1', '7')
    this.addInterpretiveUnary('SR2', '17')
    this.addInterpretiveUnary('SR3', '27')
    this.addInterpretiveUnary('SR4', '37')
    this.addInterpretiveShift('SRR', '3', IO(InterpretiveOperandType.Constant, false, true, false, false, false))
    this.addInterpretiveUnary('SR1R', '3')
    this.addInterpretiveUnary('SR2R', '13')
    this.addInterpretiveUnary('SR3R', '23')
    this.addInterpretiveUnary('SR4R', '33')
    this.addInterpretiveShift('VSL', '0', IO(InterpretiveOperandType.Constant, false, true, false, false, false))
    this.addInterpretiveUnary('VSL1', '1')
    this.addInterpretiveUnary('VSL2', '5')
    this.addInterpretiveUnary('VSL3', '11')
    this.addInterpretiveUnary('VSL4', '15')
    this.addInterpretiveUnary('VSL5', '21')
    this.addInterpretiveUnary('VSL6', '25')
    this.addInterpretiveUnary('VSL7', '31')
    this.addInterpretiveUnary('VSL8', '35')
    this.addInterpretiveShift('VSR', '1', IO(InterpretiveOperandType.Constant, false, true, false, false, false))
    this.addInterpretiveUnary('VSR1', '3')
    this.addInterpretiveUnary('VSR2', '7')
    this.addInterpretiveUnary('VSR3', '13')
    this.addInterpretiveUnary('VSR4', '17')
    this.addInterpretiveUnary('VSR5', '23')
    this.addInterpretiveUnary('VSR6', '27')
    this.addInterpretiveUnary('VSR7', '33')
    this.addInterpretiveUnary('VSR8', '37')
    // Transmission operations
    // Ref SYM VIB-35 - VIB-40
    this.addInterpretiveIndexable('DLOAD', '6', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    // this.addInterpretiveMisc('ITA', 'XX', IO(InterpretiveOperandType.Address, false, false, false, true, false))
    // this.alias('ITA', 'STQ')
    this.addInterpretiveIndexable('PDDL', '12', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('PDVL', '14', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveUnary('PUSH', '36')
    this.addInterpretiveIndexable('SETPD', '37', IO(InterpretiveOperandType.Constant, true, false, false, false, false))
    this.addInterpretiveIndexable('SLOAD', '10', IO(InterpretiveOperandType.Address, false, true, false, true, true))
    this.addInterpretiveIndexable('SSP', '11', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Constant, false, false, false, false, false))
    this.addInterpretiveUnaryRhs('STADR', '32')
    // this.addInterpretiveStore('STCALL', 'XX', IO(InterpretiveOperandType.Address, false, false, true, true, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
    // Store indexing is a holdover from BLK2 - implicit based on the operand structure of its only IAW.
    // The appropriate store ts code instruction will be chosen by the parser based on whether its IAW is indexed or not.
    // All store instruction operands but STCALL are marked as indexable, however, since that affects how they are encoded.
    this.STORE = this.addInterpretiveStore('STORE', '0', IO(InterpretiveOperandType.Address, false, true, false, true, false))
    this.STORE_INDEX_1 = this.createInterpretiveStore('STORE', '1', IO(InterpretiveOperandType.Address, false, true, false, true, false))
    this.STORE_INDEX_2 = this.createInterpretiveStore('STORE', '2', IO(InterpretiveOperandType.Address, false, true, false, true, false))
    // this.addInterpretiveStore('STODL', 'XX', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    // this.addInterpretiveStore('STOVL', 'XX', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('TLOAD', '5', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.addInterpretiveIndexable('VLOAD', '0', IO(InterpretiveOperandType.Address, true, true, false, true, true))
    // Control operations
    // Ref SYM VIB-41 - VIB-45
    // this.addInterpretiveMisc('BHIZ', 'XX', IO(InterpretiveOperandType.Address, false, false, true, true, true))
    this.addInterpretiveMisc('BMN', '27', IO(InterpretiveOperandType.Address, false, false, true, true, true))
    this.addInterpretiveMisc('BOV', '37', IO(InterpretiveOperandType.Address, false, false, true, true, true))
    this.addInterpretiveMisc('BOVB', '36', IO(InterpretiveOperandType.Address, false, false, false, false, true))
    this.addInterpretiveMisc('BPL', '26', IO(InterpretiveOperandType.Address, false, false, true, true, true))
    this.addInterpretiveMisc('BZE', '24', IO(InterpretiveOperandType.Address, false, false, true, true, true))
    // this.addInterpretiveMiscRhs('CALL', 'XX', IO(InterpretiveOperandType.Address, false, false, true, true, true))
    // this.alias(CALL, 'CALRB')
    this.addInterpretiveIndexableRhs('CCALL', '15', IO(InterpretiveOperandType.Address, true, true, false, true, false), IO(InterpretiveOperandType.Constant, false, false, false, false, true))
    this.alias('CCALL', 'CCLRB')
    this.addInterpretiveIndexableRhs('CGOTO', '4', IO(InterpretiveOperandType.Address, true, true, false, true, false), IO(InterpretiveOperandType.Constant, false, false, false, false, true))
    this.addInterpretiveUnaryRhs('EXIT', '0')
    this.addInterpretiveMiscRhs('GOTO', '25', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    // this.addInterpretiveMisc('RTB', 'XX', IO(InterpretiveOperandType.Address, false, false, false, false, true))
    this.addInterpretiveUnaryRhs('RVQ', '34')
    this.alias('RVQ', 'ITCQ')
    // Index register oriented operations
    // Ref SYM VIB-46 - VIB-49
    this.addInterpretiveMisc('AXC,1', '3', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
    this.addInterpretiveMisc('AXC,2', '2', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
    this.addInterpretiveMisc('AXT,1', '1', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
    this.addInterpretiveMisc('AXT,2', '0', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
    this.addInterpretiveMisc('INCR,1', '15', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
    this.addInterpretiveMisc('INCR,2', '14', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
    this.addInterpretiveMisc('LXA,1', '5', IO(InterpretiveOperandType.Address, false, false, false, true, false))
    this.addInterpretiveMisc('LXA,2', '4', IO(InterpretiveOperandType.Address, false, false, false, true, false))
    this.addInterpretiveMisc('LXC,1', '7', IO(InterpretiveOperandType.Address, false, false, false, true, false))
    this.addInterpretiveMisc('LXC,2', '6', IO(InterpretiveOperandType.Address, false, false, false, true, false))
    this.addInterpretiveMisc('SXA,1', '11', IO(InterpretiveOperandType.Address, false, false, false, true, false))
    this.addInterpretiveMisc('SXA,2', '10', IO(InterpretiveOperandType.Address, false, false, false, true, false))
    this.addInterpretiveMisc('TIX,1', '17', IO(InterpretiveOperandType.Address, false, false, true, true, true))
    this.addInterpretiveMisc('TIX,2', '16', IO(InterpretiveOperandType.Address, false, false, true, true, true))
    this.addInterpretiveMisc('XAD,1', '21', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('XAD,2', '20', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('XCHX,1', '13', IO(InterpretiveOperandType.Address, false, false, false, true, false))
    this.addInterpretiveMisc('XCHX,2', '12', IO(InterpretiveOperandType.Address, false, false, false, true, false))
    this.addInterpretiveMisc('XSU,1', '23', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    this.addInterpretiveMisc('XSU,2', '22', IO(InterpretiveOperandType.Address, false, false, false, true, true))
    // Logic bit operations
    // Ref SYM VIB-50 - VIB-54
    this.addInterpretiveLogical('BOF', '16', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
    this.alias('BOF', 'BOFF')
    this.addInterpretiveLogical('BOFCLR', '12', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
    this.addInterpretiveLogical('BOFINV', '6', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
    this.addInterpretiveLogical('BOFSET', '2', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
    this.addInterpretiveLogical('BON', '14', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
    this.addInterpretiveLogical('BONCLR', '10', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
    this.addInterpretiveLogical('BONINV', '4', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
    this.addInterpretiveLogical('BONSET', '0', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
    this.addInterpretiveLogical('CLEAR', '13', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
    this.alias('CLEAR', 'CLR')
    this.addInterpretiveLogical('CLRGO', '11', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
    this.addInterpretiveLogical('INVERT', '7', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
    this.alias('INVERT', 'INV')
    this.addInterpretiveLogical('INVGO', '5', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
    this.addInterpretiveLogical('SET', '3', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
    this.addInterpretiveLogical('SETGO', '1', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
  }

  protected addInterpretive1 (
    symbol: string,
    prefix: number,
    selectionCodeOctal: string,
    subType: InterpretiveType,
    rhs: boolean,
    operand1?: InterpretiveOperand,
    operand2?: InterpretiveOperand):
    Interpretive {
    const selectionCode = Number.parseInt(selectionCodeOctal, 8)
    const opCode = (selectionCode << 2) | prefix
    const op = this.createFullInterpretive(symbol, opCode, undefined, subType, rhs, operand1, operand2)
    return this.add(symbol, op)
  }

  protected addInterpretive2 (
    symbol: string,
    opCode: number | undefined,
    otherCodeOctal: string,
    subType: InterpretiveType,
    operand1?: InterpretiveOperand,
    operand2?: InterpretiveOperand):
    Interpretive {
    const op = this.createFullInterpretive(symbol, opCode, otherCodeOctal, subType, false, operand1, operand2)
    return this.add(symbol, op)
  }

  protected addInterpretiveUnary (symbol: string, selectionCodeOctal: string): Interpretive {
    return this.addInterpretive1(symbol, 0, selectionCodeOctal, InterpretiveType.Unary, false)
  }

  protected addInterpretiveUnaryRhs (symbol: string, selectionCodeOctal: string): Interpretive {
    return this.addInterpretive1(symbol, 0, selectionCodeOctal, InterpretiveType.Unary, true)
  }

  protected addInterpretiveIndexable (
    symbol: string, selectionCodeOctal: string, operand1: InterpretiveOperand, operand2?: InterpretiveOperand):
    Interpretive {
    return this.addInterpretive1(symbol, 1, selectionCodeOctal, InterpretiveType.Indexable, false, operand1, operand2)
  }

  protected addInterpretiveIndexableRhs (
    symbol: string, selectionCodeOctal: string, operand1: InterpretiveOperand, operand2?: InterpretiveOperand):
    Interpretive {
    return this.addInterpretive1(symbol, 1, selectionCodeOctal, InterpretiveType.Indexable, true, operand1, operand2)
  }

  protected addInterpretiveShift (
    symbol: string, code: string, operand1?: InterpretiveOperand, operand2?: InterpretiveOperand): Interpretive {
    return this.addInterpretive2(symbol, INTERPRETIVE_OPCODE_SHIFT, code, InterpretiveType.Shift, operand1, operand2)
  }

  protected addInterpretiveStore (
    symbol: string, tsOctal: string, operand1: InterpretiveOperand, operand2?: InterpretiveOperand): Interpretive {
    return this.addInterpretive2(symbol, undefined, tsOctal, InterpretiveType.Store, operand1, operand2)
  }

  protected createInterpretiveStore (
    symbol: string, tsOctal: string, operand1?: InterpretiveOperand, operand2?: InterpretiveOperand): Interpretive {
    return this.createFullInterpretive(symbol, undefined, tsOctal, InterpretiveType.Store, false, operand1, operand2)
  }

  protected addInterpretiveMisc (
    symbol: string, selectionCodeOctal: string, operand1: InterpretiveOperand, operand2?: InterpretiveOperand):
    Interpretive {
    return this.addInterpretive1(symbol, 2, selectionCodeOctal, InterpretiveType.Misc, false, operand1, operand2)
  }

  protected addInterpretiveMiscRhs (
    symbol: string, selectionCodeOctal: string, operand1: InterpretiveOperand, operand2?: InterpretiveOperand):
    Interpretive {
    return this.addInterpretive1(symbol, 2, selectionCodeOctal, InterpretiveType.Misc, true, operand1, operand2)
  }

  protected addInterpretiveLogical (
    symbol: string, codeOctal: string, operand1?: InterpretiveOperand, operand2?: InterpretiveOperand): Interpretive {
    return this.addInterpretive2(symbol, INTERPRETIVE_OPCODE_LOGICAL, codeOctal, InterpretiveType.Logical, operand1, operand2)
  }

  checksumTcConstant (): AddressConstant {
    return this.GENADR
  }

  checkExtendedIndex (op: Operation, extended: boolean): Operation {
    return extended && op === this.INDEX ? this.EXTENDED_INDEX : op
  }

  isIndex (op: Operation): boolean {
    return op === this.INDEX || op === this.EXTENDED_INDEX
  }

  isExtend (op: Operation): boolean {
    return op === this.EXTEND || op === this.EXTENDED_INDEX
  }
}

class Blk2Operations extends Block2Operations {
  private readonly STCALL: Interpretive
  private readonly STODL_3: Interpretive
  private readonly STODLS: Interpretive[]
  private readonly STOVL_11: Interpretive
  private readonly STOVLS: Interpretive[]

  constructor () {
    super()

    // Ref MISCJUMP table in LIST_PROCESSING_INTERPRETER for Aurora 12 vs same table in INTERPRETER for later code bases.
    // CALL/ITA and RTB/BHIZ are swapped in Aurora 12
    this.addInterpretiveMiscRhs('CALL', '30', IO(InterpretiveOperandType.Address, false, false, true, true, true))
    this.alias('CALL', 'CALRB')
    this.addInterpretiveMisc('ITA', '31', IO(InterpretiveOperandType.Address, false, false, false, true, false))
    this.alias('ITA', 'STQ')
    this.addInterpretiveMisc('RTB', '32', IO(InterpretiveOperandType.Address, false, false, false, false, true))
    this.addInterpretiveMisc('BHIZ', '33', IO(InterpretiveOperandType.Address, false, false, true, true, true))

    // Ref BTM p2-10 for BLK2 specific store format
    this.STCALL = this.addInterpretiveStore('STCALL', '17', IO(InterpretiveOperandType.Address, false, false, true, true, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
    // This is returned for a lookup of 'STODL'. The parser will call checkIndexedStore and storeFirstWordIndexed to adjust it.
    this.STODL_3 = this.addInterpretiveStore('STODL', '3', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.STODLS = [
      // Not indexed
      this.STODL_3,
      // Indexed on IAW1,X1, IAW2 not indexed
      this.createInterpretiveStore('STODL', '4', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true)),
      // Indexed on IAW1,X2, IAW2 not indexed
      this.createInterpretiveStore('STODL', '5', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true)),
      // IAW1 not indexed, indexed on IAW2
      this.createInterpretiveStore('STODL', '6', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true)),
      // Indexed on IAW1,X1 and IAW2
      this.createInterpretiveStore('STODL', '7', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true)),
      // Indexed on IAW1,X2 and IAW2
      this.createInterpretiveStore('STODL', '10', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    ]

    // This is returned for a lookup of 'STOVL'. The parser will call checkIndexedStore and storeFirstWordIndexed to adjust it.
    this.STOVL_11 = this.addInterpretiveStore('STOVL', '11', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.STOVLS = [
      // Not indexed
      this.STOVL_11,
      // Indexed on IAW1,X1, IAW2 not indexed
      this.createInterpretiveStore('STOVL', '12', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true)),
      // Indexed on IAW1,X2, IAW2 not indexed
      this.createInterpretiveStore('STOVL', '13', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true)),
      // IAW1 not indexed, indexed on IAW2
      this.createInterpretiveStore('STOVL', '14', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true)),
      // Indexed on IAW1,X1 and IAW2
      this.createInterpretiveStore('STOVL', '15', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true)),
      // Indexed on IAW1,X2 and IAW2
      this.createInterpretiveStore('STOVL', '16', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    ]
  }

  checkIndexedStore (op: Operation, indexed: boolean): Operation {
    const offset = indexed ? 3 : 0
    if (op === this.STODL_3) {
      return this.STODLS[offset]
    } else if (op === this.STOVL_11) {
      return this.STOVLS[offset]
    }

    return op
  }

  storeFirstWordIndexable (op: Operation): Necessity {
    if (op.type === Type.Interpretive) {
      const inter = op as Interpretive
      return inter === this.STORE
        || this.STODLS.includes(inter)
        || this.STOVLS.includes(inter)
        ? Necessity.Optional
        : Necessity.Never
    }
    return Necessity.Never
  }

  storeFirstWordIndexed (op: Interpretive, index: number): Interpretive {
    if (op === this.STORE) {
      return index === 1 ? this.STORE_INDEX_1 : this.STORE_INDEX_2
    } else if (op !== this.STCALL) {
      const stores = this.STODLS.includes(op) ? this.STODLS : this.STOVLS
      const storesIndex = stores.indexOf(op)
      return stores[storesIndex + index]
    }
    return op
  }
}

class AgcOperations extends Block2Operations {
  private readonly STODL: Interpretive
  private readonly STODL_INDEXED: Interpretive
  private readonly STOVL: Interpretive
  private readonly STOVL_INDEXED: Interpretive

  constructor () {
    super()

    // See note in Blk2Operations
    this.addInterpretiveMisc('RTB', '30', IO(InterpretiveOperandType.Address, false, false, false, false, true))
    this.addInterpretiveMisc('BHIZ', '31', IO(InterpretiveOperandType.Address, false, false, true, true, true))
    this.addInterpretiveMiscRhs('CALL', '32', IO(InterpretiveOperandType.Address, false, false, true, true, true))
    this.alias('CALL', 'CALRB')
    this.addInterpretiveMisc('ITA', '33', IO(InterpretiveOperandType.Address, false, false, false, true, false))
    this.alias('ITA', 'STQ')

    this.addInterpretiveStore('STCALL', '7', IO(InterpretiveOperandType.Address, false, false, true, true, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
    this.STODL = this.addInterpretiveStore('STODL', '3', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.STODL_INDEXED = this.createInterpretiveStore('STODL', '4', IO(InterpretiveOperandType.Address, true, false, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.STOVL = this.addInterpretiveStore('STOVL', '5', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
    this.STOVL_INDEXED = this.createInterpretiveStore('STOVL', '6', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
  }

  checkIndexedStore (op: Operation, indexed: boolean): Operation {
    if (indexed) {
      if (op === this.STODL) {
        return this.STODL_INDEXED
      } else if (op === this.STOVL) {
        return this.STOVL_INDEXED
      }
    }

    return op
  }

  storeFirstWordIndexable (op: Operation): Necessity {
    return op === this.STORE ? Necessity.Optional : Necessity.Never
  }

  storeFirstWordIndexed (op: Interpretive, index: number): Interpretive {
    if (op === this.STORE) {
      return index === 1 ? this.STORE_INDEX_1 : this.STORE_INDEX_2
    }
    return op
  }
}
