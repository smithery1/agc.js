//
// This file contains definitions for all the operation codes.
// The various documentation sources were written at different times and disagree on some particulars.
// Where those particulars might be important, they are mentioned in comments.
// The general rule here is that if an operation is in the documentation but not in any of the code, it is not
// implemented.
//

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
   * The allowable values for the address field.
   */
  readonly addressRange: BasicAddressRange
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
 * There are a handful of codes referred to in Ref YUL but that do not appear in the source, such as HEAD, TAIL, and
 * MEMORY.
 * They are not supported here.
 */
export interface Clerical extends BaseOperation {
  readonly locationField: Necessity
  readonly addressField: Necessity
  readonly compliment: Necessity
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
 * Whether an interpretive operand references the contents of an address or a numeric constant
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
  readonly index: boolean
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

const ops = new Map<string, BaseOperation>()

/**
 * Returns the operation for the specified symbol.
 * Returns undefined if no operation has the specified symbol name.
 *
 * @param symbol the symbol to look up
 * @returns the operation for the specified symbol
 */
export function operation (symbol: string): Operation | undefined {
  return ops.get(symbol)
}

/**
 * Returns the operation for the specified symbol.
 * Throws an Error if no operation has the specified symbol name.
 *
 * @param symbol the symbol to look up
 * @returns the operation for the specified symbol
 */
export function requireOperation (symbol: string): Operation {
  const op = operation(symbol)
  if (op === undefined) {
    throw new Error('unknown operation ' + symbol)
  }
  return op
}

function add (symbol: string, op: Operation): void {
  if (ops.has(symbol)) {
    throw new Error('duplicate symbol: ' + symbol)
  }
  ops.set(symbol, op)
}

function addClerical (
  symbol: string, words: number,
  locationField: Necessity, addressField: Necessity, compliment: Necessity, index: Necessity): void {
  const op = { type: Type.Clerical, symbol, words, locationField, addressField, compliment, index }
  add(symbol, op)
}

function addAddress (symbol: string, words: number): void {
  const op = { type: Type.Address, symbol, words }
  add(symbol, op)
}

function addBasicQc (symbol: string, opCode: number, qc: number, addressBias?: number): void {
  addBasicExtended(false, symbol, opCode, qc, BasicAddressRange.ErasableMemory, addressBias)
}

function addBasic (symbol: string, opCode: number, addressRange: BasicAddressRange, addressBias?: number): void {
  addBasicExtended(false, symbol, opCode, undefined, addressRange, addressBias)
}

function addBasicSpecial (symbol: string, opCode: number, specialAddress: number): void {
  const op = {
    type: Type.Basic, symbol, isExtended: false, opCode, specialAddress, addressField: Necessity.Never, words: 1
  }
  add(symbol, op)
}

function addBasicQcSpecial (symbol: string, opCode: number, qc: number, specialAddress: number): void {
  const op = {
    type: Type.Basic, symbol, isExtended: false, opCode, qc, specialAddress, addressField: Necessity.Never, words: 1
  }
  add(symbol, op)
}

function addExtendedQc (symbol: string, opCode: number, qc: number, addressBias?: number): void {
  addBasicExtended(true, symbol, opCode, qc, BasicAddressRange.ErasableMemory, addressBias)
}

function addExtended (symbol: string, opCode: number, addressRange: BasicAddressRange, addressBias?: number): void {
  addBasicExtended(true, symbol, opCode, undefined, addressRange, addressBias)
}

function addExtendedSpecial (symbol: string, opCode: number, specialAddress: number): void {
  const op = {
    type: Type.Basic, symbol, isExtended: true, opCode, specialAddress, addressField: Necessity.Never, words: 1
  }
  add(symbol, op)
}

function addExtendedQcSpecial (symbol: string, opCode: number, qc: number, specialAddress: number): void {
  const op = {
    type: Type.Basic, symbol, isExtended: true, opCode, qc, specialAddress, addressField: Necessity.Never, words: 1
  }
  add(symbol, op)
}

function addExtendedIO (symbol: string, pc: number): void {
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
  add(symbol, op)
}

function addBasicExtended (
  isExtended: boolean,
  symbol: string,
  opCode: number,
  qc: number | undefined,
  addressRange: BasicAddressRange,
  addressBias?: number):
  void {
  const op = {
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
  add(symbol, op)
}

function IO (
  type: InterpretiveOperandType,
  pushDown: boolean,
  index: boolean,
  indirect: boolean,
  erasableMemory: boolean,
  fixedMemory: boolean):
  InterpretiveOperand {
  const IO = function (
    type: InterpretiveOperandType,
    pushDown: boolean,
    index: boolean,
    indirect: boolean,
    erasableMemory: boolean,
    fixedMemory: boolean):
    void {
    this.type = type
    this.pushDown = pushDown
    this.index = index
    this.indirect = indirect
    this.erasableMemory = erasableMemory
    this.fixedMemory = fixedMemory
  }
  return new IO(type, pushDown, index, indirect, erasableMemory, fixedMemory)
}

function addInterpretiveUnary (symbol: string, selectionCodeOctal: string): void {
  addInterpretive1(symbol, 0, selectionCodeOctal, InterpretiveType.Unary, false)
}

function addInterpretiveUnaryRhs (symbol: string, selectionCodeOctal: string): void {
  addInterpretive1(symbol, 0, selectionCodeOctal, InterpretiveType.Unary, true)
}

function addInterpretiveIndexable (
  symbol: string, selectionCodeOctal: string, operand1: InterpretiveOperand, operand2?: InterpretiveOperand): void {
  addInterpretive1(symbol, 1, selectionCodeOctal, InterpretiveType.Indexable, false, operand1, operand2)
}

function addInterpretiveIndexableRhs (
  symbol: string, selectionCodeOctal: string, operand1: InterpretiveOperand, operand2?: InterpretiveOperand): void {
  addInterpretive1(symbol, 1, selectionCodeOctal, InterpretiveType.Indexable, true, operand1, operand2)
}

function addInterpretiveShift (
  symbol: string, code: string, operand1?: InterpretiveOperand, operand2?: InterpretiveOperand): void {
  addInterpretive2(symbol, INTERPRETIVE_OPCODE_SHIFT, code, InterpretiveType.Shift, operand1, operand2)
}

function addInterpretiveStore (
  symbol: string, tsOctal: string, operand1: InterpretiveOperand, operand2?: InterpretiveOperand): void {
  addInterpretive2(symbol, undefined, tsOctal, InterpretiveType.Store, operand1, operand2)
}

function createInterpretiveStore (
  symbol: string, tsOctal: string, operand1?: InterpretiveOperand, operand2?: InterpretiveOperand): Interpretive {
  return createFullInterpretive(symbol, undefined, tsOctal, InterpretiveType.Store, false, operand1, operand2)
}

function addInterpretiveMisc (
  symbol: string, selectionCodeOctal: string, operand1: InterpretiveOperand, operand2?: InterpretiveOperand): void {
  addInterpretive1(symbol, 2, selectionCodeOctal, InterpretiveType.Misc, false, operand1, operand2)
}

function addInterpretiveMiscRhs (
  symbol: string, selectionCodeOctal: string, operand1: InterpretiveOperand, operand2?: InterpretiveOperand): void {
  addInterpretive1(symbol, 2, selectionCodeOctal, InterpretiveType.Misc, true, operand1, operand2)
}

function addInterpretiveLogical (
  symbol: string, codeOctal: string, operand1?: InterpretiveOperand, operand2?: InterpretiveOperand): void {
  addInterpretive2(symbol, INTERPRETIVE_OPCODE_LOGICAL, codeOctal, InterpretiveType.Logical, operand1, operand2)
}

function addInterpretive1 (
  symbol: string,
  prefix: number,
  selectionCodeOctal: string,
  subType: InterpretiveType,
  rhs: boolean,
  operand1?: InterpretiveOperand,
  operand2?: InterpretiveOperand): void {
  const selectionCode = Number.parseInt(selectionCodeOctal, 8)
  const opCode = (selectionCode << 2) | prefix
  const op = createFullInterpretive(symbol, opCode, undefined, subType, rhs, operand1, operand2)
  add(symbol, op)
}

function addInterpretive2 (
  symbol: string,
  opCode: number | undefined,
  otherCodeOctal: string,
  subType: InterpretiveType,
  operand1?: InterpretiveOperand,
  operand2?: InterpretiveOperand): void {
  const op = createFullInterpretive(symbol, opCode, otherCodeOctal, subType, false, operand1, operand2)
  add(symbol, op)
}

function createFullInterpretive (
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

function addNumeric (symbol: string, words: number): void {
  const op = { type: Type.Numeric, symbol, words }
  add(symbol, op)
}

function alias (alias: string, original: string): void {
  const op = ops.get(original)
  if (op === undefined) {
    throw new Error('unknown instruction: ' + original)
  }
  if (ops.has(alias)) {
    throw new Error('duplicate symbol as alias: ' + alias)
  }
  ops.set(alias, op)
}

//
// Clerical
//
// Note erase can be 0 or 1 words, depending on the address field.
// This is handled in the assembler, but the parser needs it to be non-zero to perform other checks.
addClerical('=MINUS', 0, Necessity.Required, Necessity.Required, Necessity.Never, Necessity.Never)
addClerical('=PLUS', 0, Necessity.Required, Necessity.Required, Necessity.Never, Necessity.Never)
addClerical('ERASE', 1, Necessity.Optional, Necessity.Optional, Necessity.Never, Necessity.Never)
addClerical('BANK', 0, Necessity.Never, Necessity.Optional, Necessity.Never, Necessity.Never)
addClerical('BLOCK', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Never)
addClerical('BNKSUM', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Never)
addClerical('COUNT', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Optional)
addClerical('EBANK=', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Required)
addClerical('EQUALS', 0, Necessity.Required, Necessity.Optional, Necessity.Never, Necessity.Never)
alias('=', 'EQUALS')
addClerical('MEMORY', 0, Necessity.Required, Necessity.Required, Necessity.Never, Necessity.Never)
addClerical('SBANK=', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Never)
addClerical('SETLOC', 0, Necessity.Never, Necessity.Required, Necessity.Never, Necessity.Never)
alias('LOC', 'SETLOC')

//
// Address
//
addAddress('2CADR', 2)
alias('2BCADR', '2CADR')
addAddress('2FCADR', 2)
addAddress('ADRES', 1)
addAddress('BBCON', 1)
addAddress('CADR', 1)
alias('FCADR', 'CADR')
addAddress('ECADR', 1)
addAddress('GENADR', 1)
addAddress('P', 1)
alias('', 'P')
addAddress('REMADR', 1)
// Telemetry downlist: Ref SYM, VC-1 & VC-3
addAddress('DNCHAN', 1)
addAddress('DNPTR', 1)
addAddress('1DNADR', 1)
addAddress('2DNADR', 1)
addAddress('3DNADR', 1)
addAddress('4DNADR', 1)
addAddress('5DNADR', 1)
addAddress('6DNADR', 1)

//
// Numeric
//
addNumeric('2DEC', 2)
addNumeric('2OCT', 2)
alias('2OCTAL', '2OCT')
addNumeric('DEC', 1)
addNumeric('OCT', 1)
alias('OCTAL', 'OCT')
addNumeric('MM', 1)
addNumeric('VN', 1)
alias('NV', 'VN')

//
// Basic
//
addBasic('TC', 0, BasicAddressRange.AnyMemory)
addBasicSpecial('RELINT', 0, 3)
addBasicSpecial('INHINT', 0, 4)
addBasicSpecial('EXTEND', 0, 6)
addBasicQc('CCS', 1, 0)
addBasic('TCF', 1, BasicAddressRange.FixedMemory)
addBasicQc('DAS', 2, 0, 1)
addBasicQc('LXCH', 2, 1)
addBasicQc('INCR', 2, 2)
addBasicQc('ADS', 2, 3)
addBasic('CA', 3, BasicAddressRange.AnyMemory)
addBasic('CAE', 3, BasicAddressRange.ErasableMemory)
addBasic('CAF', 3, BasicAddressRange.FixedMemory)
addBasic('CS', 4, BasicAddressRange.AnyMemory)
addBasicQc('TS', 5, 2)
// There are two INDEXES, one basic and one extended.
// This is the basic one.
// The extended one taken care of by the assembler.
addBasicQc('INDEX', 5, 0)
addBasicSpecial('RESUME', 5, 15)
addBasicQc('DXCH', 5, 1, 1)
addBasicQc('XCH', 5, 3)
addBasic('AD', 6, BasicAddressRange.AnyMemory)
addBasic('MASK', 7, BasicAddressRange.AnyMemory)
// Implied Address Codes
addBasicSpecial('COM', 4, 0)
addBasicQcSpecial('DDOUBL', 2, 0, 1)
addBasicSpecial('DOUBLE', 6, 0)
addBasicQcSpecial('DTCB', 5, 1, 6)
addBasicQcSpecial('DTCF', 5, 1, 5)
// There are two NOOP opcodes, one if in fixed memory and one if in erasable memory.
// The erasable one is equivalent to CA A (30000), but we don't assemble into erasable memory.
// The fixed one is equivalent to TCF (I + 1).
// REF BTM, Figure 7, page 1-45
addBasic('NOOP', 1, BasicAddressRange.FixedMemory, 1)
addBasicQcSpecial('OVSK', 5, 2, 0)
addBasicSpecial('RETURN', 0, 2)
addBasicQcSpecial('TCAA', 5, 2, 5)
addBasicSpecial('XLQ', 0, 1)
addBasicSpecial('XXALQ', 0, 0)
addBasicQcSpecial('ZL', 2, 1, 7)

alias('0', 'TC')
alias('1', 'CCS')
alias('2', 'DAS')
alias('3', 'CA')
alias('4', 'CS')
alias('5', 'INDEX')
alias('6', 'AD')
alias('7', 'MASK')
alias('MSK', 'MASK')
alias('NDX', 'INDEX')
alias('TCR', 'TC')

//
// Extended
//
addExtendedIO('READ', 0)
addExtendedIO('WRITE', 1)
addExtendedIO('RAND', 2)
addExtendedIO('WAND', 3)
addExtendedIO('ROR', 4)
addExtendedIO('WOR', 5)
addExtendedIO('RXOR', 6)

addExtended('EDRUPT', 0, BasicAddressRange.FixedMemory)
addExtendedQc('DV', 1, 0)
addExtended('BZF', 1, BasicAddressRange.FixedMemory)
addExtendedQc('MSU', 2, 0)
addExtendedQc('QXCH', 2, 1)
addExtendedQc('AUG', 2, 2)
addExtendedQc('DIM', 2, 3)
addExtended('DCA', 3, BasicAddressRange.AnyMemory, 1)
addExtended('DCS', 4, BasicAddressRange.AnyMemory, 1)
// INDEX is defined as a non-extended, might need it here too?
addExtendedQc('SU', 6, 0)
addExtended('BZMF', 6, BasicAddressRange.FixedMemory)
addExtended('MP', 7, BasicAddressRange.AnyMemory)
// Implied Address Codes
addExtendedSpecial('DCOM', 4, 1)
addExtendedSpecial('SQUARE', 7, 0)
addExtendedQcSpecial('ZQ', 2, 1, 7)

// alias('4', 'MP')
// alias('5', 'DV')
// alias('6', 'SU')

//
// Interpreter
//
// Note data mostly from tables in Ref BTM, 2-12 - 2-17 but these are wrong in a couple of cases.
// CCALL, CGOTO, PUSHD, SIGN: should be "push", verified from Luminary099 INTERPRETER page 1011.
// PDVL: should not be "push" per Ref BTM, but seems to be used that way.
// SIGN: indexable and applies to fixed mem per Ref SYM, VIB-11.
// NORM: indexable per Ref SYM, VB-26.
//

// Ref SYM, VIB-50 prefix 2, selection code 34
const INTERPRETIVE_OPCODE_LOGICAL = 114
// Ref SYM, VIB-26 prefix 1, selection code 23
const INTERPRETIVE_OPCODE_SHIFT = 77

// Scalar computations
addInterpretiveUnary('ABS', '26')
addInterpretiveUnary('ACOS', '12')
alias('ARCCOS', 'ACOS')
addInterpretiveUnary('ASIN', '10')
alias('ARCSIN', 'ASIN')
addInterpretiveIndexable('BDDV', '22', IO(InterpretiveOperandType.Address, true, true, false, true, true))
addInterpretiveIndexable('BDSU', '33', IO(InterpretiveOperandType.Address, true, true, false, true, true))
addInterpretiveUnary('COS', '6')
alias('COSINE', 'COS')
addInterpretiveIndexable('DAD', '34', IO(InterpretiveOperandType.Address, true, true, false, true, true))
addInterpretiveUnary('DCOMP', '20')
addInterpretiveIndexable('DDV', '21', IO(InterpretiveOperandType.Address, true, true, false, true, true))
addInterpretiveIndexable('DMP', '36', IO(InterpretiveOperandType.Address, true, true, false, true, true))
addInterpretiveIndexable('DMPR', '20', IO(InterpretiveOperandType.Address, true, true, false, true, true))
addInterpretiveUnary('DSQ', '14')
addInterpretiveIndexable('DSU', '32', IO(InterpretiveOperandType.Address, true, true, false, true, true))
addInterpretiveUnary('ROUND', '16')
addInterpretiveIndexable('SIGN', '2', IO(InterpretiveOperandType.Address, true, true, false, true, true))
addInterpretiveUnary('SIN', '4')
alias('SINE', 'SIN')
addInterpretiveUnary('SQRT', '2')
addInterpretiveIndexable('TAD', '1', IO(InterpretiveOperandType.Address, true, true, false, true, true))
// Vector computations
addInterpretiveUnary('ABVAL', '26')
addInterpretiveIndexable('BVSU', '26', IO(InterpretiveOperandType.Address, true, true, false, true, true))
addInterpretiveIndexable('DOT', '27', IO(InterpretiveOperandType.Address, true, true, false, true, true))
addInterpretiveIndexable('MXV', '13', IO(InterpretiveOperandType.Address, false, true, false, true, true))
addInterpretiveUnary('UNIT', '24')
addInterpretiveIndexable('VAD', '24', IO(InterpretiveOperandType.Address, true, true, false, true, true))
addInterpretiveUnary('VCOMP', '20')
addInterpretiveUnary('VDEF', '22')
addInterpretiveIndexable('VPROJ', '31', IO(InterpretiveOperandType.Address, true, true, false, true, true))
addInterpretiveUnary('VSQ', '30')
addInterpretiveIndexable('VSU', '25', IO(InterpretiveOperandType.Address, true, true, false, true, true))
addInterpretiveIndexable('VXM', '16', IO(InterpretiveOperandType.Address, false, true, false, true, true))
addInterpretiveIndexable('VXSC', '3', IO(InterpretiveOperandType.Address, true, true, false, true, true))
addInterpretiveIndexable('VXV', '30', IO(InterpretiveOperandType.Address, true, true, false, true, true))
addInterpretiveIndexable('V/SC', '7', IO(InterpretiveOperandType.Address, true, true, false, true, true))
// Shifting operations
addInterpretiveIndexable('NORM', '17', IO(InterpretiveOperandType.Address, false, true, false, true, false))
alias('SLC', 'NORM')
addInterpretiveShift('SL', '0', IO(InterpretiveOperandType.Constant, false, true, false, false, false))
addInterpretiveUnary('SL1', '5')
addInterpretiveUnary('SL2', '15')
addInterpretiveUnary('SL3', '25')
addInterpretiveUnary('SL4', '35')
addInterpretiveShift('SLR', '2', IO(InterpretiveOperandType.Constant, false, true, false, false, false))
addInterpretiveUnary('SL1R', '1')
addInterpretiveUnary('SL2R', '11')
addInterpretiveUnary('SL3R', '21')
addInterpretiveUnary('SL4R', '31')
addInterpretiveShift('SR', '1', IO(InterpretiveOperandType.Constant, false, true, false, false, false))
addInterpretiveUnary('SR1', '7')
addInterpretiveUnary('SR2', '17')
addInterpretiveUnary('SR3', '27')
addInterpretiveUnary('SR4', '37')
addInterpretiveShift('SRR', '3', IO(InterpretiveOperandType.Constant, false, true, false, false, false))
addInterpretiveUnary('SR1R', '3')
addInterpretiveUnary('SR2R', '13')
addInterpretiveUnary('SR3R', '23')
addInterpretiveUnary('SR4R', '33')
addInterpretiveShift('VSL', '0', IO(InterpretiveOperandType.Constant, false, true, false, false, false))
addInterpretiveUnary('VSL1', '1')
addInterpretiveUnary('VSL2', '5')
addInterpretiveUnary('VSL3', '11')
addInterpretiveUnary('VSL4', '15')
addInterpretiveUnary('VSL5', '21')
addInterpretiveUnary('VSL6', '25')
addInterpretiveUnary('VSL7', '31')
addInterpretiveUnary('VSL8', '35')
addInterpretiveShift('VSR', '1', IO(InterpretiveOperandType.Constant, false, true, false, false, false))
addInterpretiveUnary('VSR1', '3')
addInterpretiveUnary('VSR2', '7')
addInterpretiveUnary('VSR3', '13')
addInterpretiveUnary('VSR4', '17')
addInterpretiveUnary('VSR5', '23')
addInterpretiveUnary('VSR6', '27')
addInterpretiveUnary('VSR7', '33')
addInterpretiveUnary('VSR8', '37')
// Transmission operations
addInterpretiveIndexable('DLOAD', '6', IO(InterpretiveOperandType.Address, true, true, false, true, true))
addInterpretiveMisc('ITA', '33', IO(InterpretiveOperandType.Address, false, false, false, true, false))
alias('STQ', 'ITA')
addInterpretiveIndexable('PDDL', '12', IO(InterpretiveOperandType.Address, true, true, false, true, true))
addInterpretiveIndexable('PDVL', '14', IO(InterpretiveOperandType.Address, true, true, false, true, true))
addInterpretiveUnary('PUSH', '36')
addInterpretiveIndexable('SETPD', '37', IO(InterpretiveOperandType.Constant, true, false, false, false, false))
addInterpretiveIndexable('SLOAD', '10', IO(InterpretiveOperandType.Address, false, true, false, true, true))
addInterpretiveIndexable('SSP', '11', IO(InterpretiveOperandType.Address, false, true, false, true, false), IO(InterpretiveOperandType.Constant, false, false, false, false, false))
addInterpretiveUnaryRhs('STADR', '32')
addInterpretiveStore('STCALL', '7', IO(InterpretiveOperandType.Address, false, false, true, true, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
addInterpretiveStore('STODL', '3', IO(InterpretiveOperandType.Address, false, false, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
export const STODL_INDEXED = createInterpretiveStore('STODL', '4', IO(InterpretiveOperandType.Address, false, false, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
// Store indexing is implicit based on the operand structure, not explicit with a '*' like other op codes
addInterpretiveStore('STORE', '0', IO(InterpretiveOperandType.Address, false, false, false, true, false))
export const STORE_INDEX_1 = createInterpretiveStore('STORE', '1', IO(InterpretiveOperandType.Address, false, true, false, true, false))
export const STORE_INDEX_2 = createInterpretiveStore('STORE', '2', IO(InterpretiveOperandType.Address, false, true, false, true, false))
addInterpretiveStore('STOVL', '5', IO(InterpretiveOperandType.Address, false, false, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
export const STOVL_INDEXED = createInterpretiveStore('STOVL', '6', IO(InterpretiveOperandType.Address, false, false, false, true, false), IO(InterpretiveOperandType.Address, true, true, false, true, true))
addInterpretiveIndexable('TLOAD', '5', IO(InterpretiveOperandType.Address, true, true, false, true, true))
addInterpretiveIndexable('VLOAD', '0', IO(InterpretiveOperandType.Address, true, true, false, true, true))
// Control operations
addInterpretiveMisc('BHIZ', '31', IO(InterpretiveOperandType.Address, false, false, true, true, true))
addInterpretiveMisc('BMN', '27', IO(InterpretiveOperandType.Address, false, false, true, true, true))
addInterpretiveMisc('BOV', '37', IO(InterpretiveOperandType.Address, false, false, true, true, true))
addInterpretiveMisc('BOVB', '36', IO(InterpretiveOperandType.Address, false, false, false, false, true))
addInterpretiveMisc('BPL', '26', IO(InterpretiveOperandType.Address, false, false, true, true, true))
addInterpretiveMisc('BZE', '24', IO(InterpretiveOperandType.Address, false, false, true, true, true))
addInterpretiveMiscRhs('CALL', '32', IO(InterpretiveOperandType.Address, false, false, true, true, true))
alias('CALRB', 'CALL')
addInterpretiveIndexableRhs('CCALL', '15', IO(InterpretiveOperandType.Address, true, true, false, true, false), IO(InterpretiveOperandType.Constant, false, false, false, false, true))
alias('CCLRB', 'CCALL')
addInterpretiveIndexableRhs('CGOTO', '4', IO(InterpretiveOperandType.Address, true, true, false, true, false), IO(InterpretiveOperandType.Constant, false, false, false, false, true))
addInterpretiveUnaryRhs('EXIT', '0')
addInterpretiveMiscRhs('GOTO', '25', IO(InterpretiveOperandType.Address, false, false, false, true, true))
addInterpretiveMisc('RTB', '30', IO(InterpretiveOperandType.Address, false, false, false, false, true))
addInterpretiveUnaryRhs('RVQ', '34')
alias('ITCQ', 'RVQ')
// Index register oriented operations
addInterpretiveMisc('AXC,1', '3', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
addInterpretiveMisc('AXC,2', '2', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
addInterpretiveMisc('AXT,1', '1', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
addInterpretiveMisc('AXT,2', '0', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
addInterpretiveMisc('INCR,1', '15', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
addInterpretiveMisc('INCR,2', '14', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
addInterpretiveMisc('LXA,1', '5', IO(InterpretiveOperandType.Address, false, false, false, true, false))
addInterpretiveMisc('LXA,2', '4', IO(InterpretiveOperandType.Address, false, false, false, true, false))
addInterpretiveMisc('LXC,1', '7', IO(InterpretiveOperandType.Address, false, false, false, true, false))
addInterpretiveMisc('LXC,2', '6', IO(InterpretiveOperandType.Address, false, false, false, true, false))
addInterpretiveMisc('SXA,1', '11', IO(InterpretiveOperandType.Address, false, false, false, true, false))
addInterpretiveMisc('SXA,2', '10', IO(InterpretiveOperandType.Address, false, false, false, true, false))
addInterpretiveMisc('TIX,1', '17', IO(InterpretiveOperandType.Address, false, false, true, true, true))
addInterpretiveMisc('TIX,2', '16', IO(InterpretiveOperandType.Address, false, false, true, true, true))
addInterpretiveMisc('XAD,1', '21', IO(InterpretiveOperandType.Address, false, false, false, true, true))
addInterpretiveMisc('XAD,2', '20', IO(InterpretiveOperandType.Address, false, false, false, true, true))
addInterpretiveMisc('XCHX,1', '13', IO(InterpretiveOperandType.Address, false, false, false, true, false))
addInterpretiveMisc('XCHX,2', '12', IO(InterpretiveOperandType.Address, false, false, false, true, false))
addInterpretiveMisc('XSU,1', '23', IO(InterpretiveOperandType.Address, false, false, false, true, true))
addInterpretiveMisc('XSU,2', '22', IO(InterpretiveOperandType.Address, false, false, false, true, true))
// Logic bit operations
addInterpretiveLogical('BOF', '16', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
alias('BOFF', 'BOF')
addInterpretiveLogical('BOFCLR', '12', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
addInterpretiveLogical('BOFINV', '6', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
addInterpretiveLogical('BOFSET', '2', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
addInterpretiveLogical('BON', '14', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
addInterpretiveLogical('BONCLR', '10', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
addInterpretiveLogical('BONINV', '4', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
addInterpretiveLogical('BONSET', '0', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
addInterpretiveLogical('CLEAR', '13', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
alias('CLR', 'CLEAR')
addInterpretiveLogical('CLRGO', '11', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
addInterpretiveLogical('INVERT', '7', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
alias('INV', 'INVERT')
addInterpretiveLogical('INVGO', '5', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
addInterpretiveLogical('SET', '3', IO(InterpretiveOperandType.Constant, false, false, false, false, false))
addInterpretiveLogical('SETGO', '1', IO(InterpretiveOperandType.Constant, false, false, false, false, false), IO(InterpretiveOperandType.Address, false, false, true, true, true))
