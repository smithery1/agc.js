//
// This file contains definitions for all the operation codes.
// The various documentation sources were written at different times and disagree on some particulars.
// Where those particulars might be important, they are mentioned in comments.
// The general rule here is that if an operation is in the documentation but not in any of the code, it is not
// implemented.
//

import { Options, YulVersion } from './bootstrap'

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

export function createOperations (options: Options): Operations {
  return options.yulVersion <= YulVersion.BLK2 ? new Blk2Operations() : new AgcOperations()
}

export function isBlk2Operations (ops: Operations): ops is Blk2Operations {
  return ops instanceof Blk2Operations
}

export function isAgcOperations (ops: Operations): ops is AgcOperations {
  return ops instanceof AgcOperations
}

export abstract class Operations {
  readonly ops = new Map<string, BaseOperation>()

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
   * Returns the extended form of the INDEX operation if op is INDEX and extended is true, otherwise returns op.
   *
   * @param op the operation to check
   * @param extended whether preceded by an EXTEND instruction
   * @returns the extended form of the INDEX operation if op is INDEX and extended is true, otherwise returns op
   */
  checkExtendedIndex (op: Operation, extended: boolean): Operation {
    return extended && op === this.INDEX ? this.EXTENDED_INDEX : op
  }

  /**
   * Returns true iff the op is the basic or extended variant of INDEX.
   *
   * @param op the operation to check
   * @returns true iff the op is the basic or extended variant of INDEX
   */
  isIndex (op: Operation): boolean {
    return op === this.INDEX || op === this.EXTENDED_INDEX
  }

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

  private add<Type extends BaseOperation> (symbol: string, op: Type): Type {
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

  private addBasicQc (symbol: string, opCode: number, qc: number, addressBias?: number): Basic {
    return this.addBasicExtended(false, symbol, opCode, qc, BasicAddressRange.ErasableMemory, addressBias)
  }

  private addBasic (symbol: string, opCode: number, addressRange: BasicAddressRange, addressBias?: number): Basic {
    return this.addBasicExtended(false, symbol, opCode, undefined, addressRange, addressBias)
  }

  private addBasicSpecial (symbol: string, opCode: number, specialAddress: number): Basic {
    const op = {
      type: Type.Basic, symbol, isExtended: false, opCode, specialAddress, addressField: Necessity.Never, words: 1
    }
    return this.add(symbol, op)
  }

  private addBasicQcSpecial (symbol: string, opCode: number, qc: number, specialAddress: number): Basic {
    const op = {
      type: Type.Basic, symbol, isExtended: false, opCode, qc, specialAddress, addressField: Necessity.Never, words: 1
    }
    return this.add(symbol, op)
  }

  private addExtendedQc (symbol: string, opCode: number, qc: number, addressBias?: number): Basic {
    return this.addBasicExtended(true, symbol, opCode, qc, BasicAddressRange.ErasableMemory, addressBias)
  }

  private addExtended (symbol: string, opCode: number, addressRange: BasicAddressRange, addressBias?: number): Basic {
    return this.addBasicExtended(true, symbol, opCode, undefined, addressRange, addressBias)
  }

  private addExtendedSpecial (symbol: string, opCode: number, specialAddress: number): Basic {
    const op = {
      type: Type.Basic, symbol, isExtended: true, opCode, specialAddress, addressField: Necessity.Never, words: 1
    }
    return this.add(symbol, op)
  }

  private addExtendedQcSpecial (symbol: string, opCode: number, qc: number, specialAddress: number): Basic {
    const op = {
      type: Type.Basic, symbol, isExtended: true, opCode, qc, specialAddress, addressField: Necessity.Never, words: 1
    }
    return this.add(symbol, op)
  }

  private addExtendedIO (symbol: string, pc: number): Basic {
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

  private createBasicExtended (
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

  private addBasicExtended (
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
    return this.addInterpretive2(symbol, this.INTERPRETIVE_OPCODE_SHIFT, code, InterpretiveType.Shift, operand1, operand2)
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
    return this.addInterpretive2(symbol, this.INTERPRETIVE_OPCODE_LOGICAL, codeOctal, InterpretiveType.Logical, operand1, operand2)
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

  protected alias<Type extends BaseOperation> (original: Type, alias: string): Type {
    if (this.ops.has(alias)) {
      throw new Error('duplicate symbol as alias: ' + alias)
    }
    this.ops.set(alias, original)
    return original
  }

  //
  // Clerical
  //
  readonly EQ_ECADR = this.addClerical('=ECADR', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Never)
  readonly EQ_MINUS = this.addClerical('=MINUS', 0, Necessity.Required, Necessity.Required, Necessity.Never, Necessity.Never)
  readonly EQ_PLUS = this.addClerical('=PLUS', 0, Necessity.Required, Necessity.Required, Necessity.Never, Necessity.Never)
  readonly CHECK_EQ = this.addClerical('CHECK=', 0, Necessity.Required, Necessity.Required, Necessity.Never, Necessity.Never)
  // Note erase can be 0 or 1 words, depending on the address field.
  // This is handled in the assembler, but the parser needs it to be non-zero to perform other checks.
  readonly ERASE = this.addClerical('ERASE', 1, Necessity.Optional, Necessity.Optional, Necessity.Never, Necessity.Never)
  readonly BANK = this.addClerical('BANK', 0, Necessity.Never, Necessity.Optional, Necessity.Never, Necessity.Never)
  readonly BLOCK = this.addClerical('BLOCK', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Never)
  readonly BNKSUM = this.addClerical('BNKSUM', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Never)
  readonly COUNT = this.addClerical('COUNT', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Optional)
  readonly EBANK_EQ = this.addClerical('EBANK=', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Required)
  readonly EQUALS = this.addClerical('EQUALS', 0, Necessity.Optional, Necessity.Optional, Necessity.Never, Necessity.Never)
  readonly EQ = this.alias(this.EQUALS, '=')
  readonly MEMORY = this.addClerical('MEMORY', 0, Necessity.Required, Necessity.Required, Necessity.Never, Necessity.Never)
  readonly SBANK_EQ = this.addClerical('SBANK=', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Never)
  readonly SETLOC = this.addClerical('SETLOC', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Never)
  readonly LOC = this.alias(this.SETLOC, 'LOC')
  readonly SUBRO = this.addClerical('SUBRO', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Never)

  //
  // Address
  //
  readonly TWO_CADR = this.addAddress('2CADR', 2, Necessity.Required)
  readonly TWO_BCADR = this.alias(this.TWO_CADR, '2BCADR')
  readonly TWO_FCADR = this.addAddress('2FCADR', 2, Necessity.Required)
  readonly ADRES = this.addAddress('ADRES', 1, Necessity.Optional)
  readonly BBCON = this.addAddress('BBCON', 1, Necessity.Optional)
  readonly CADR = this.addAddress('CADR', 1, Necessity.Optional)
  readonly FCADR = this.alias(this.CADR, 'FCADR')
  readonly ECADR = this.addAddress('ECADR', 1, Necessity.Required)
  readonly GENADR = this.addAddress('GENADR', 1, Necessity.Optional)
  readonly P = this.addAddress('P', 1, Necessity.Required)
  readonly EMPTY = this.alias(this.P, '')
  readonly REMADR = this.addAddress('REMADR', 1, Necessity.Required)
  // Telemetry downlist: Ref SYM, VC-1 & VC-3
  readonly DNCHAN = this.addAddress('DNCHAN', 1, Necessity.Required)
  readonly DNPTR = this.addAddress('DNPTR', 1, Necessity.Required)
  readonly ONE_DNADR = this.addAddress('1DNADR', 1, Necessity.Required)
  readonly TWO_DNADR = this.addAddress('2DNADR', 1, Necessity.Required)
  readonly THREE_DNADR = this.addAddress('3DNADR', 1, Necessity.Required)
  readonly FOUR_DNADR = this.addAddress('4DNADR', 1, Necessity.Required)
  readonly FIVE_DNADR = this.addAddress('5DNADR', 1, Necessity.Required)
  readonly SIX_DNADR = this.addAddress('6DNADR', 1, Necessity.Required)

  //
  // Numeric
  //
  readonly TWO_DEC = this.addNumeric('2DEC', 2)
  readonly TWO_OCT = this.addNumeric('2OCT', 2)
  readonly TWO_OCTAL = this.alias(this.TWO_OCT, '2OCTAL')
  readonly DEC = this.addNumeric('DEC', 1)
  readonly OCT = this.addNumeric('OCT', 1)
  readonly OCTAL = this.alias(this.OCT, 'OCTAL')
  readonly MM = this.addNumeric('MM', 1)
  readonly VN = this.addNumeric('VN', 1)
  readonly NV = this.alias(this.VN, 'NV')

  //
  // Basic
  //
  readonly TC = this.addBasic('TC', 0, BasicAddressRange.AnyMemory)
  readonly ZERO = this.alias(this.TC, '0')
  readonly TCR = this.alias(this.TC, 'TCR')
  readonly RELINT = this.addBasicSpecial('RELINT', 0, 3)
  readonly INHINT = this.addBasicSpecial('INHINT', 0, 4)
  readonly EXTEND = this.addBasicSpecial('EXTEND', 0, 6)
  readonly CCS = this.addBasicQc('CCS', 1, 0)
  readonly ONE = this.alias(this.CCS, '1')
  readonly TCF = this.addBasic('TCF', 1, BasicAddressRange.FixedMemory)
  readonly DAS = this.addBasicQc('DAS', 2, 0, 1)
  readonly TWO = this.alias(this.DAS, '2')
  readonly LXCH = this.addBasicQc('LXCH', 2, 1)
  readonly INCR = this.addBasicQc('INCR', 2, 2)
  readonly ADS = this.addBasicQc('ADS', 2, 3)
  readonly CA = this.addBasic('CA', 3, BasicAddressRange.AnyMemory)
  readonly THREE = this.alias(this.CA, '3')
  readonly CAE = this.addBasic('CAE', 3, BasicAddressRange.ErasableMemory)
  readonly CAF = this.addBasic('CAF', 3, BasicAddressRange.FixedMemory)
  readonly CS = this.addBasic('CS', 4, BasicAddressRange.AnyMemory)
  readonly FOUR = this.alias(this.CS, '4')
  readonly TS = this.addBasicQc('TS', 5, 2)
  // There are two INDEXES, one basic and one extended.
  // This is the basic one.
  readonly INDEX = this.addBasicQc('INDEX', 5, 0)
  // This is the extended one.
  readonly EXTENDED_INDEX = this.createBasicExtended(true, 'INDEX', 5, 0, BasicAddressRange.AnyMemory, undefined)
  readonly FIVE = this.alias(this.INDEX, '5')
  readonly NDX = this.alias(this.INDEX, 'NDX')
  readonly RESUME = this.addBasicSpecial('RESUME', 5, 15)
  readonly DXCH = this.addBasicQc('DXCH', 5, 1, 1)
  readonly XCH = this.addBasicQc('XCH', 5, 3)
  readonly AD = this.addBasic('AD', 6, BasicAddressRange.AnyMemory)
  readonly SIX = this.alias(this.AD, '6')
  readonly MASK = this.addBasic('MASK', 7, BasicAddressRange.AnyMemory)
  readonly SEVEN = this.alias(this.MASK, '7')
  readonly MSK = this.alias(this.MASK, 'MSK')
  // Implied Address Codes
  readonly COM = this.addBasicSpecial('COM', 4, 0)
  readonly DDOUBL = this.addBasicQcSpecial('DDOUBL', 2, 0, 1)
  readonly DOUBLE = this.addBasicSpecial('DOUBLE', 6, 0)
  readonly DTCB = this.addBasicQcSpecial('DTCB', 5, 1, 6)
  readonly DTCF = this.addBasicQcSpecial('DTCF', 5, 1, 5)
  // There are two NOOP opcodes, one if in fixed memory and one if in erasable memory.
  // The erasable one is equivalent to CA A (30000), but we don't assemble into erasable memory.
  // The fixed one is equivalent to TCF (I + 1).
  // REF BTM, Figure 7, page 1-45
  readonly NOOP = this.addBasic('NOOP', 1, BasicAddressRange.FixedMemory, 1)
  readonly OVSK = this.addBasicQcSpecial('OVSK', 5, 2, 0)
  readonly RETURN = this.addBasicSpecial('RETURN', 0, 2)
  readonly TCAA = this.addBasicQcSpecial('TCAA', 5, 2, 5)
  readonly XLQ = this.addBasicSpecial('XLQ', 0, 1)
  readonly XXALQ = this.addBasicSpecial('XXALQ', 0, 0)
  readonly ZL = this.addBasicQcSpecial('ZL', 2, 1, 7)

  //
  // Extended
  //
  readonly READ = this.addExtendedIO('READ', 0)
  readonly WRITE = this.addExtendedIO('WRITE', 1)
  readonly RAND = this.addExtendedIO('RAND', 2)
  readonly WAND = this.addExtendedIO('WAND', 3)
  readonly ROR = this.addExtendedIO('ROR', 4)
  readonly WOR = this.addExtendedIO('WOR', 5)
  readonly RXOR = this.addExtendedIO('RXOR', 6)

  readonly EDRUPT = this.addExtended('EDRUPT', 0, BasicAddressRange.FixedMemory)
  readonly DV = this.addExtendedQc('DV', 1, 0)
  readonly BZF = this.addExtended('BZF', 1, BasicAddressRange.FixedMemory)
  readonly MSU = this.addExtendedQc('MSU', 2, 0)
  readonly QXCH = this.addExtendedQc('QXCH', 2, 1)
  readonly AUG = this.addExtendedQc('AUG', 2, 2)
  readonly DIM = this.addExtendedQc('DIM', 2, 3)
  readonly DCA = this.addExtended('DCA', 3, BasicAddressRange.AnyMemory, 1)
  readonly DCS = this.addExtended('DCS', 4, BasicAddressRange.AnyMemory, 1)
  readonly SU = this.addExtendedQc('SU', 6, 0)
  readonly BZMF = this.addExtended('BZMF', 6, BasicAddressRange.FixedMemory)
  readonly MP = this.addExtended('MP', 7, BasicAddressRange.AnyMemory)
  // Implied Address Codes
  readonly DCOM = this.addExtendedSpecial('DCOM', 4, 1)
  readonly SQUARE = this.addExtendedSpecial('SQUARE', 7, 0)
  readonly ZQ = this.addExtendedQcSpecial('ZQ', 2, 1, 7)
  // Extended aliases that appear in documentation but not in code.
  // alias('4', 'MP')
  // alias('5', 'DV')
  // alias('6', 'SU')

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

  // Ref SYM, VIB-50 prefix 2, selection code 34
  readonly INTERPRETIVE_OPCODE_LOGICAL = 114
  // Ref SYM, VIB-26 prefix 1, selection code 23
  readonly INTERPRETIVE_OPCODE_SHIFT = 77

  // Scalar computations
  // Ref SYM VIB-3 - VIB-14
  readonly ABS = this.addInterpretiveUnary('ABS', '26')
  readonly ACOS = this.addInterpretiveUnary('ACOS', '12')
  readonly ARCCOS = this.alias(this.ACOS, 'ARCCOS')
  readonly ASIN = this.addInterpretiveUnary('ASIN', '10')
  readonly ARCSIN = this.alias(this.ASIN, 'ARCSIN')
  readonly BDDV = this.addInterpretiveIndexable('BDDV', '22', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly BDSU = this.addInterpretiveIndexable('BDSU', '33', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly COS = this.addInterpretiveUnary('COS', '6')
  readonly COSINE = this.alias(this.COS, 'COSINE')
  readonly DAD = this.addInterpretiveIndexable('DAD', '34', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly DCOMP = this.addInterpretiveUnary('DCOMP', '20')
  readonly DDV = this.addInterpretiveIndexable('DDV', '21', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly DMP = this.addInterpretiveIndexable('DMP', '36', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly DMPR = this.addInterpretiveIndexable('DMPR', '20', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly DSQ = this.addInterpretiveUnary('DSQ', '14')
  readonly DSU = this.addInterpretiveIndexable('DSU', '32', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly ROUND = this.addInterpretiveUnary('ROUND', '16')
  readonly SIGN = this.addInterpretiveIndexable('SIGN', '2', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly SIN = this.addInterpretiveUnary('SIN', '4')
  readonly SINE = this.alias(this.SIN, 'SINE')
  readonly SQRT = this.addInterpretiveUnary('SQRT', '2')
  readonly TAD = this.addInterpretiveIndexable('TAD', '1', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  // Vector computations
  // Ref SYM VIB-15 - VIB-25
  readonly ABVAL = this.addInterpretiveUnary('ABVAL', '26')
  readonly BVSU = this.addInterpretiveIndexable('BVSU', '26', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly DOT = this.addInterpretiveIndexable('DOT', '27', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly MXV = this.addInterpretiveIndexable('MXV', '13', IO(InterpretiveOperandType.Address, false, true, false, true, true))
  readonly UNIT = this.addInterpretiveUnary('UNIT', '24')
  readonly VAD = this.addInterpretiveIndexable('VAD', '24', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly VCOMP = this.addInterpretiveUnary('VCOMP', '20')
  readonly VDEF = this.addInterpretiveUnary('VDEF', '22')
  readonly VPROJ = this.addInterpretiveIndexable('VPROJ', '31', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly VSQ = this.addInterpretiveUnary('VSQ', '30')
  readonly VSU = this.addInterpretiveIndexable('VSU', '25', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly VXM = this.addInterpretiveIndexable('VXM', '16', IO(InterpretiveOperandType.Address, false, true, false, true, true))
  readonly VXSC = this.addInterpretiveIndexable('VXSC', '3', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly VXV = this.addInterpretiveIndexable('VXV', '30', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly VSC = this.addInterpretiveIndexable('V/SC', '7', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  // Shifting operations
  // Ref SYM VIB-26 - VIB-34
  readonly NORM = this.addInterpretiveIndexable('NORM', '17', IO(InterpretiveOperandType.Address, false, true, false, true, false))
  readonly SLC = this.alias(this.NORM, 'SLC')
  readonly SL = this.addInterpretiveShift('SL', '0', IO(InterpretiveOperandType.Constant, false, true, false, false, false))
  readonly SL1 = this.addInterpretiveUnary('SL1', '5')
  readonly SL2 = this.addInterpretiveUnary('SL2', '15')
  readonly SL3 = this.addInterpretiveUnary('SL3', '25')
  readonly SL4 = this.addInterpretiveUnary('SL4', '35')
  readonly SLR = this.addInterpretiveShift('SLR', '2', IO(InterpretiveOperandType.Constant, false, true, false, false, false))
  readonly SL1R = this.addInterpretiveUnary('SL1R', '1')
  readonly SL2R = this.addInterpretiveUnary('SL2R', '11')
  readonly SL3R = this.addInterpretiveUnary('SL3R', '21')
  readonly SL4R = this.addInterpretiveUnary('SL4R', '31')
  readonly SR = this.addInterpretiveShift('SR', '1', IO(InterpretiveOperandType.Constant, false, true, false, false, false))
  readonly SR1 = this.addInterpretiveUnary('SR1', '7')
  readonly SR2 = this.addInterpretiveUnary('SR2', '17')
  readonly SR3 = this.addInterpretiveUnary('SR3', '27')
  readonly SR4 = this.addInterpretiveUnary('SR4', '37')
  readonly SRR = this.addInterpretiveShift('SRR', '3', IO(InterpretiveOperandType.Constant, false, true, false, false, false))
  readonly SR1R = this.addInterpretiveUnary('SR1R', '3')
  readonly SR2R = this.addInterpretiveUnary('SR2R', '13')
  readonly SR3R = this.addInterpretiveUnary('SR3R', '23')
  readonly SR4R = this.addInterpretiveUnary('SR4R', '33')
  readonly VSL = this.addInterpretiveShift('VSL', '0', IO(InterpretiveOperandType.Constant, false, true, false, false, false))
  readonly VSL1 = this.addInterpretiveUnary('VSL1', '1')
  readonly VSL2 = this.addInterpretiveUnary('VSL2', '5')
  readonly VSL3 = this.addInterpretiveUnary('VSL3', '11')
  readonly VSL4 = this.addInterpretiveUnary('VSL4', '15')
  readonly VSL5 = this.addInterpretiveUnary('VSL5', '21')
  readonly VSL6 = this.addInterpretiveUnary('VSL6', '25')
  readonly VSL7 = this.addInterpretiveUnary('VSL7', '31')
  readonly VSL8 = this.addInterpretiveUnary('VSL8', '35')
  readonly VSR = this.addInterpretiveShift('VSR', '1', IO(InterpretiveOperandType.Constant, false, true, false, false, false))
  readonly VSR1 = this.addInterpretiveUnary('VSR1', '3')
  readonly VSR2 = this.addInterpretiveUnary('VSR2', '7')
  readonly VSR3 = this.addInterpretiveUnary('VSR3', '13')
  readonly VSR4 = this.addInterpretiveUnary('VSR4', '17')
  readonly VSR5 = this.addInterpretiveUnary('VSR5', '23')
  readonly VSR6 = this.addInterpretiveUnary('VSR6', '27')
  readonly VSR7 = this.addInterpretiveUnary('VSR7', '33')
  readonly VSR8 = this.addInterpretiveUnary('VSR8', '37')
  // Transmission operations
  // Ref SYM VIB-35 - VIB-40
  readonly DLOAD = this.addInterpretiveIndexable('DLOAD', '6', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  // readonly ITA = this.addInterpretiveMisc('ITA', 'XX', IO(InterpretiveOperandType.Address, false, false, false, true, false))
  // readonly STQ = this.alias(this.ITA, 'STQ')
  readonly PDDL = this.addInterpretiveIndexable('PDDL', '12', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly PDVL = this.addInterpretiveIndexable('PDVL', '14', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly PUSH = this.addInterpretiveUnary('PUSH', '36')
  readonly SETPD = this.addInterpretiveIndexable('SETPD', '37', IO(InterpretiveOperandType.Constant, true, false, false, false, false))
  readonly SLOAD = this.addInterpretiveIndexable('SLOAD', '10', IO(InterpretiveOperandType.Address, false, true, false, true, true))
  readonly SSP = this.addInterpretiveIndexable('SSP', '11', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Constant, false, false, false, false, false))
  readonly STADR = this.addInterpretiveUnaryRhs('STADR', '32')
  // readonly STCALL = this.addInterpretiveStore('STCALL', 'XX', IO(InterpretiveOperandType.Address, false, false, true, true, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
  // Store indexing is a holdover from BLK2 - implicit based on the operand structure for its only IAW
  // The appropriate store ts code instruction will be chosen by the parser based on whether its IAW is indexed or not.
  // All store instruction operands but STCALL are marked as indexable, however, since that affects how they are encoded.
  readonly STORE = this.addInterpretiveStore('STORE', '0', IO(InterpretiveOperandType.Address, false, true, false, true, false))
  readonly STORE_INDEX_1 = this.createInterpretiveStore('STORE', '1', IO(InterpretiveOperandType.Address, false, true, false, true, false))
  readonly STORE_INDEX_2 = this.createInterpretiveStore('STORE', '2', IO(InterpretiveOperandType.Address, false, true, false, true, false))
  // readonly STODL = this.addInterpretiveStore('STODL', 'XX', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
  // readonly STOVL = this.addInterpretiveStore('STOVL', 'XX', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly TLOAD = this.addInterpretiveIndexable('TLOAD', '5', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly VLOAD = this.addInterpretiveIndexable('VLOAD', '0', IO(InterpretiveOperandType.Address, true, true, false, true, true))
  // Control operations
  // Ref SYM VIB-41 - VIB-45
  // readonly BHIZ = this.addInterpretiveMisc('BHIZ', 'XX', IO(InterpretiveOperandType.Address, false, false, true, true, true))
  readonly BMN = this.addInterpretiveMisc('BMN', '27', IO(InterpretiveOperandType.Address, false, false, true, true, true))
  readonly BOV = this.addInterpretiveMisc('BOV', '37', IO(InterpretiveOperandType.Address, false, false, true, true, true))
  readonly BOVB = this.addInterpretiveMisc('BOVB', '36', IO(InterpretiveOperandType.Address, false, false, false, false, true))
  readonly BPL = this.addInterpretiveMisc('BPL', '26', IO(InterpretiveOperandType.Address, false, false, true, true, true))
  readonly BZE = this.addInterpretiveMisc('BZE', '24', IO(InterpretiveOperandType.Address, false, false, true, true, true))
  // readonly CALL = this.addInterpretiveMiscRhs('CALL', 'XX', IO(InterpretiveOperandType.Address, false, false, true, true, true))
  // readonly CALRB = this.alias(this.CALL, 'CALRB')
  readonly CCALL = this.addInterpretiveIndexableRhs('CCALL', '15', IO(InterpretiveOperandType.Address, true, true, false, true, false), IO(InterpretiveOperandType.Constant, false, false, false, false, true))
  readonly CCLRB = this.alias(this.CCALL, 'CCLRB')
  readonly CGOTO = this.addInterpretiveIndexableRhs('CGOTO', '4', IO(InterpretiveOperandType.Address, true, true, false, true, false), IO(InterpretiveOperandType.Constant, false, false, false, false, true))
  readonly EXIT = this.addInterpretiveUnaryRhs('EXIT', '0')
  readonly GOTO = this.addInterpretiveMiscRhs('GOTO', '25', IO(InterpretiveOperandType.Address, false, false, false, true, true))
  // readonly RTB = this.addInterpretiveMisc('RTB', 'XX', IO(InterpretiveOperandType.Address, false, false, false, false, true))
  readonly RVQ = this.addInterpretiveUnaryRhs('RVQ', '34')
  readonly ITCQ = this.alias(this.RVQ, 'ITCQ')
  // Index register oriented operations
  // Ref SYM VIB-46 - VIB-49
  readonly AXC1 = this.addInterpretiveMisc('AXC,1', '3', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
  readonly AXC2 = this.addInterpretiveMisc('AXC,2', '2', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
  readonly AXT1 = this.addInterpretiveMisc('AXT,1', '1', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
  readonly AXT2 = this.addInterpretiveMisc('AXT,2', '0', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
  readonly INCR1 = this.addInterpretiveMisc('INCR,1', '15', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
  readonly INCR2 = this.addInterpretiveMisc('INCR,2', '14', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
  readonly LXA1 = this.addInterpretiveMisc('LXA,1', '5', IO(InterpretiveOperandType.Address, false, false, false, true, false))
  readonly LXA2 = this.addInterpretiveMisc('LXA,2', '4', IO(InterpretiveOperandType.Address, false, false, false, true, false))
  readonly LXC1 = this.addInterpretiveMisc('LXC,1', '7', IO(InterpretiveOperandType.Address, false, false, false, true, false))
  readonly LXC2 = this.addInterpretiveMisc('LXC,2', '6', IO(InterpretiveOperandType.Address, false, false, false, true, false))
  readonly SXA1 = this.addInterpretiveMisc('SXA,1', '11', IO(InterpretiveOperandType.Address, false, false, false, true, false))
  readonly SXA2 = this.addInterpretiveMisc('SXA,2', '10', IO(InterpretiveOperandType.Address, false, false, false, true, false))
  readonly TIX1 = this.addInterpretiveMisc('TIX,1', '17', IO(InterpretiveOperandType.Address, false, false, true, true, true))
  readonly TIX2 = this.addInterpretiveMisc('TIX,2', '16', IO(InterpretiveOperandType.Address, false, false, true, true, true))
  readonly XAD1 = this.addInterpretiveMisc('XAD,1', '21', IO(InterpretiveOperandType.Address, false, false, false, true, true))
  readonly XAD2 = this.addInterpretiveMisc('XAD,2', '20', IO(InterpretiveOperandType.Address, false, false, false, true, true))
  readonly XCHX1 = this.addInterpretiveMisc('XCHX,1', '13', IO(InterpretiveOperandType.Address, false, false, false, true, false))
  readonly XCHX2 = this.addInterpretiveMisc('XCHX,2', '12', IO(InterpretiveOperandType.Address, false, false, false, true, false))
  readonly XSU1 = this.addInterpretiveMisc('XSU,1', '23', IO(InterpretiveOperandType.Address, false, false, false, true, true))
  readonly XSU2 = this.addInterpretiveMisc('XSU,2', '22', IO(InterpretiveOperandType.Address, false, false, false, true, true))
  // Logic bit operations
  // Ref SYM VIB-50 - VIB-54
  readonly BOF = this.addInterpretiveLogical('BOF', '16', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
  readonly BOFF = this.alias(this.BOF, 'BOFF')
  readonly BOFCLR = this.addInterpretiveLogical('BOFCLR', '12', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
  readonly BOFINV = this.addInterpretiveLogical('BOFINV', '6', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
  readonly BOFSET = this.addInterpretiveLogical('BOFSET', '2', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
  readonly BON = this.addInterpretiveLogical('BON', '14', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
  readonly BONCLR = this.addInterpretiveLogical('BONCLR', '10', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
  readonly BONINV = this.addInterpretiveLogical('BONINV', '4', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
  readonly BONSET = this.addInterpretiveLogical('BONSET', '0', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
  readonly CLEAR = this.addInterpretiveLogical('CLEAR', '13', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
  readonly CLR = this.alias(this.CLEAR, 'CLR')
  readonly CLRGO = this.addInterpretiveLogical('CLRGO', '11', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
  readonly INVERT = this.addInterpretiveLogical('INVERT', '7', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
  readonly INV = this.alias(this.INVERT, 'INV')
  readonly INVGO = this.addInterpretiveLogical('INVGO', '5', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
  readonly SET = this.addInterpretiveLogical('SET', '3', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
  readonly SETGO = this.addInterpretiveLogical('SETGO', '1', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
}

export class Blk2Operations extends Operations {
  // Ref LIST_PROCESSING_INTERPRETER MISCJUMP table vs INTERPRETER for later code bases.
  // CALL/ITA and RTB/BHIZ are swapped in Aurora 12
  readonly CALL = this.addInterpretiveMiscRhs('CALL', '30', IO(InterpretiveOperandType.Address, false, false, true, true, true))
  readonly CALRB = this.alias(this.CALL, 'CALRB')
  readonly ITA = this.addInterpretiveMisc('ITA', '31', IO(InterpretiveOperandType.Address, false, false, false, true, false))
  readonly STQ = this.alias(this.ITA, 'STQ')
  readonly RTB = this.addInterpretiveMisc('RTB', '32', IO(InterpretiveOperandType.Address, false, false, false, false, true))
  readonly BHIZ = this.addInterpretiveMisc('BHIZ', '33', IO(InterpretiveOperandType.Address, false, false, true, true, true))

  // Ref BTM p2-10 for BLK2 specific store format
  readonly STCALL = this.addInterpretiveStore('STCALL', '17', IO(InterpretiveOperandType.Address, false, false, true, true, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
  // This is returned for a lookup of 'STODL'. The parser will call checkIndexedStore to adjust it.
  readonly STODL_3 = this.addInterpretiveStore('STODL', '3', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly STODLS = [
    // Not indexed
    this.STODL_3,
    // Indexed on IAW1,X1
    this.createInterpretiveStore('STODL', '4', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true)),
    // Indexed on IAW1,X2
    this.createInterpretiveStore('STODL', '5', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true)),
    // Indexed on IAW2
    this.createInterpretiveStore('STODL', '6', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true)),
    // Indexed on IAW1,X1 and IAW2
    this.createInterpretiveStore('STODL', '7', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true)),
    // Indexed on IAW1,X2 and IAW2
    this.createInterpretiveStore('STODL', '10', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
  ]

  // This is returned for a lookup of 'STOVL'. The parser will call checkIndexedStore to adjust it.
  readonly STOVL_11 = this.addInterpretiveStore('STOVL', '11', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly STOVLS = [
    // Not indexed
    this.STOVL_11,
    // Indexed on IAW1,X1
    this.createInterpretiveStore('STOVL', '12', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true)),
    // Indexed on IAW1,X2
    this.createInterpretiveStore('STOVL', '13', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true)),
    // Indexed on IAW2
    this.createInterpretiveStore('STOVL', '14', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true)),
    // Indexed on IAW1,X1 and IAW2
    this.createInterpretiveStore('STOVL', '15', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true)),
    // Indexed on IAW1,X2 and IAW2
    this.createInterpretiveStore('STOVL', '16', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
  ]

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

export class AgcOperations extends Operations {
  // See note in Blk2Operations
  readonly RTB = this.addInterpretiveMisc('RTB', '30', IO(InterpretiveOperandType.Address, false, false, false, false, true))
  readonly BHIZ = this.addInterpretiveMisc('BHIZ', '31', IO(InterpretiveOperandType.Address, false, false, true, true, true))
  readonly CALL = this.addInterpretiveMiscRhs('CALL', '32', IO(InterpretiveOperandType.Address, false, false, true, true, true))
  readonly CALRB = this.alias(this.CALL, 'CALRB')
  readonly ITA = this.addInterpretiveMisc('ITA', '33', IO(InterpretiveOperandType.Address, false, false, false, true, false))
  readonly STQ = this.alias(this.ITA, 'STQ')

  readonly STCALL = this.addInterpretiveStore('STCALL', '7', IO(InterpretiveOperandType.Address, false, false, true, true, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
  readonly STODL = this.addInterpretiveStore('STODL', '3', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly STODL_INDEXED = this.createInterpretiveStore('STODL', '4', IO(InterpretiveOperandType.Address, true, false, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly STOVL = this.addInterpretiveStore('STOVL', '5', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
  readonly STOVL_INDEXED = this.createInterpretiveStore('STOVL', '6', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))

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
