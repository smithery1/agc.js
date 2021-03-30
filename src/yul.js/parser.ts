import { InputStream } from '../common/compat'
import * as af from './address-field'
import * as cusses from './cusses'
import { lex, LexedLine, LineType } from './lexer'
import { lexNumeric } from './numeric-card'
import * as ops from './operations'
import { isWhitespace } from './util'

/**
 * The location field. Contains a symbol.
 */
export interface LocationField {
  readonly symbol: string
}

/**
 * The operation field.
 * Contains an instruction an a flag.
 * The flag is true if the instruction is basic and prefixed with '-' or interpretive and suffixed with '*'.
 */
export interface OperationField<OperationType = ops.Operation> {
  readonly operation: OperationType
  readonly complimented: boolean
  readonly indexed: boolean
}

export interface AddressField extends af.AddressField {
  readonly indexRegister?: number
}

export interface OperandStackElement {
  operator: OperationField<ops.Interpretive>
  operand: ops.InterpretiveOperand
}

export interface NumericConstantField {
  readonly highWord?: number
  readonly lowWord: number
}

export enum CardType {
  Insertion,
  Remark,
  Basic,
  Interpretive,
  Numeric,
  Address,
  Clerical
}

export interface InsertionCard {
  readonly type: CardType.Insertion
  readonly file: string
}

export interface RemarkCard {
  readonly type: CardType.Remark
  readonly fullLine: boolean
}

export interface InstructionCard {
  readonly type: CardType
  readonly location?: LocationField
}

export interface BasicInstructionCard extends InstructionCard {
  readonly type: CardType.Basic
  readonly operation: OperationField<ops.Basic>
  readonly address?: AddressField
}

export interface InterpretiveInstructionCard extends InstructionCard {
  readonly type: CardType.Interpretive
  readonly lhs?: OperationField<ops.Interpretive>
  readonly rhs?: OperationField<ops.Interpretive> | AddressField
}

export interface NumericConstantCard extends InstructionCard {
  readonly type: CardType.Numeric
  readonly operation: OperationField<ops.NumericConstant>
  readonly interpretive?: OperandStackElement
  readonly highWord?: number
  readonly lowWord: number
}

export interface AddressConstantCard extends InstructionCard {
  readonly type: CardType.Address
  readonly operation: OperationField<ops.AddressConstant>
  readonly interpretive?: OperandStackElement
  readonly address: AddressField
}

export interface ClericalCard extends InstructionCard {
  readonly type: CardType.Clerical
  readonly operation: OperationField<ops.Clerical>
  readonly interpretive?: OperandStackElement
  readonly address?: AddressField
}

export function isAddressConstant (card: any): card is AddressConstantCard {
  return cardIsOfType(card, ops.Type.Address)
}

export function isBasic (card: any): card is BasicInstructionCard {
  return cardIsOfType(card, ops.Type.Basic)
}

export function isClerical (card: any): card is ClericalCard {
  return cardIsOfType(card, ops.Type.Clerical)
}

export function isInterpretive (card: any): card is InterpretiveInstructionCard {
  return cardIsOfType(card, ops.Type.Interpretive)
}

export function isNumericConstant (card: any): card is NumericConstantCard {
  return cardIsOfType(card, ops.Type.Numeric)
}

export function isInsertion (card: any): card is InsertionCard {
  return 'file' in (card ?? {})
}

export function isRemark (card: any): card is RemarkCard {
  return 'fullLine' in (card ?? {})
}

function cardIsOfType (card: any, type: ops.Type): boolean {
  return 'operation' in (card ?? {}) && (card.operation as OperationField).operation.type === type
}

export interface ParsedCard {
  lexedLine: LexedLine
  card?: any
  cusses?: cusses.Cusses
}

/**
 * A signed number.
 *
 * Ref 2, III-1 - III-2 "Format of Guidance Program Symbolic Listing"
 */
const SIGNED_EXPR = /^[+-]\d+D?$/

/**
 * A unsigned number.
 *
 * Ref 2, III-1 - III-2 "Format of Guidance Program Symbolic Listing"
 */
const UNSIGNED_EXPR = /^\d+D?$/

const OCTAL_INTEGER_EXPR = /^[0-7]+/

const ADDRESS_FIELD_EXPR = /^([^\s]+)(?:\s+([+-]\d+D?))?(?:,([12]))?$/
const ERASE_FIELD_EXPR = /^(\d+D?)\s+-\s+(\d+D?)$/
const INDEXED_FIELD_EXPR = /^([^\s,]+)(?:\s+([+-]\d+D?))?(?:,([12]))?$/

const MAX_OFFSET = 0x7FFF
const MAX_ADDRESS = 0x7FFF

interface ParsedOp<OperationType = ops.Operation> {
  readonly op: OperationType
  readonly complimented: boolean
  readonly indexed: boolean
}

interface LineOp<OperationType = ops.Operation> {
  readonly lexedLine: LexedLine
  readonly location?: LocationField
  readonly parsedOp: ParsedOp<OperationType>
}

interface ParsedLine {
  lexedLine: LexedLine
  card?: any
}

const BBCON_OP = ops.requireOperation('BBCON')
const IAW_OP = ops.requireOperation('P')
const INDEX_OP = ops.requireOperation('INDEX')
const ERASE_OP = ops.requireOperation('ERASE')
const EXTEND_OP = ops.requireOperation('EXTEND')
const STADR_OP = ops.requireOperation('STADR')
const STORE_OP = ops.requireOperation('STORE')

export class Parser {
  private readonly opDispatch = {
    [ops.Type.Basic]: this.parseBasicInstruction.bind(this),
    [ops.Type.Interpretive]: this.parseInterpretiveInstruction.bind(this),
    [ops.Type.Clerical]: this.parseClericalCard.bind(this),
    [ops.Type.Address]: this.parseAddressConstantCard.bind(this),
    [ops.Type.Numeric]: this.parseNumericConstantCard.bind(this)
  }

  private readonly interpretiveOperands: OperandStackElement[]
  private isExtended: boolean
  private isStadr: boolean
  private cardCusses: cusses.Cusses

  constructor () {
    this.interpretiveOperands = []
    this.isExtended = false
    this.isStadr = false
  }

  async * parse (source: string, stream: InputStream): AsyncGenerator<ParsedCard> {
    this.cardCusses = new cusses.Cusses()

    for await (const lexed of lex(source, stream)) {
      if (lexed.type === LineType.Insertion) {
        yield { lexedLine: lexed, card: { file: lexed.field1 } }
      } else if (lexed.type === LineType.Remark) {
        yield { lexedLine: lexed, card: { fullLine: lexed.field1 === undefined } }
      } else {
        const parsedLine = this.parseCard(lexed)
        const localCusses = this.cardCusses.empty() ? undefined : this.cardCusses
        if (localCusses !== undefined) {
          this.cardCusses = new cusses.Cusses()
        }
        yield ({ lexedLine: parsedLine.lexedLine, card: parsedLine.card, cusses: localCusses })
      }
    }
  }

  parseCard (lexedLine: LexedLine): ParsedLine {
    if (lexedLine.field1 !== undefined && lexedLine.field2 === undefined && lexedLine.field3 === undefined) {
      this.cardCusses.add(cusses.Cuss41)
      return { lexedLine }
    }

    const parsedLocation = this.parseLocation(lexedLine.field1)
    const location = parsedLocation.location

    const operationField = lexedLine.field2 === undefined ? '' : lexedLine.field2
    const parsedOp = this.parseOp(operationField)
    if (cusses.isCuss(parsedOp)) {
      this.cardCusses.add(parsedOp)
      return { lexedLine }
    }

    const dispatching: LineOp = { lexedLine, location, parsedOp }
    return this.opDispatch[parsedOp.op.type](dispatching)
  }

  parseLocation (token?: string): { location?: LocationField } {
    if (token === undefined) {
      return {}
    }

    token = token.trim()
    if (token.length === 0) {
      return {}
    }

    if (SIGNED_EXPR.test(token)) {
      return {}
    }

    if (UNSIGNED_EXPR.test(token)) {
      this.cardCusses.add(cusses.Cuss4A)
    }

    if (isWhitespace(token)) {
      this.cardCusses.add(cusses.Cuss47)
    }

    if (token.length > 8) {
      this.cardCusses.add(cusses.Cuss4B)
    }

    return { location: { symbol: token } }
  }

  parseOp (field: string): ParsedOp | cusses.Cuss {
    let input = field
    const complimented = input.charAt(0) === '-'
    const indexed = input.charAt(input.length - 1) === '*'
    if (complimented) {
      input = input.substring(1)
    }
    if (indexed) {
      input = input.substring(0, input.length - 1)
    }

    const op = ops.operation(input)
    if (op === undefined) {
      return cusses.Cuss41
    }

    return { op, complimented, indexed }
  }

  parseAddressConstantCard (input: LineOp<ops.AddressConstant>): ParsedLine {
    this.verifyNotExtended()
    this.verifyNotStadr()

    const operand = input.lexedLine.field3
    // Ref 2, IIF-5. Special case for BBCON* for checksumming routine.
    const isBbconStar = input.parsedOp.indexed && input.parsedOp.op === BBCON_OP
    const operandNecessity = isBbconStar ? ops.Necessity.Never : ops.Necessity.Required

    if (isBbconStar) {
      if (input.parsedOp.complimented) {
        this.cardCusses.add(cusses.Cuss01)
      }
    } else {
      if (input.parsedOp.indexed) {
        this.cardCusses.add(cusses.Cuss40)
      }
    }

    if (!this.verifyOperand(input, operandNecessity)) {
      return { lexedLine: input.lexedLine }
    }

    const pushDown = this.popExplicit(input.parsedOp.op)
    let parsed: AddressField | cusses.Cuss
    if (operand === undefined) {
      // BBCON*
      parsed = { value: 0 }
    } else {
      if (input.parsedOp.op === IAW_OP) {
        if (pushDown === undefined) {
          this.cardCusses.add(cusses.Cuss0E)
          parsed = parseAddressField(operand, ops.Necessity.Never, false)
        } else {
          const indexed = pushDown.operator.indexed && pushDown.operand.index
          const indexedNecessity = indexed ? ops.Necessity.Required : ops.Necessity.Never
          parsed = parseAddressField(operand, indexedNecessity, false)
        }
      } else {
        parsed = parseAddressField(operand, ops.Necessity.Never, false)
      }

      if (cusses.isCuss(parsed)) {
        this.cardCusses.add(parsed)
        return { lexedLine: input.lexedLine }
      }
    }

    const card: AddressConstantCard = {
      type: CardType.Address,
      location: input.location,
      operation: {
        operation: input.parsedOp.op, complimented: input.parsedOp.complimented, indexed: input.parsedOp.indexed
      },
      address: parsed,
      interpretive: pushDown
    }
    return { lexedLine: input.lexedLine, card }
  }

  parseClericalCard (input: LineOp<ops.Clerical>): ParsedLine {
    // We shouldn't have weird assembler operations like SETLOC between EXTEND and its target.
    // Unfortunately, there is at least one such operation in the code, which has no effect on
    // the location counter.
    // So warn but allow.
    switch (input.parsedOp.op.symbol) {
      case 'EBANK=':
      case 'SBANK=':
        break

      default:
        if (this.isExtended) {
          this.cardCusses.add(cusses.Cuss27, 'Operation should immediately follow EXTEND')
        }
    }
    this.verifyNotStadr()

    let pushDown: OperandStackElement | undefined
    if (input.parsedOp.op.words > 0) {
      pushDown = this.popExplicit(input.parsedOp.op)
    } else if (this.interpretiveOperands.length > 0) {
      // Let's not allow weird clerical operations like SETLOC in the middle of an IIW / IAW pair
      this.cardCusses.add(cusses.Cuss0F)
    }

    if (input.parsedOp.complimented && input.parsedOp.op.compliment === ops.Necessity.Never) {
      this.cardCusses.add(cusses.Cuss01)
    }
    if (input.parsedOp.indexed && input.parsedOp.op.index === ops.Necessity.Never) {
      this.cardCusses.add(cusses.Cuss40)
    }

    if (!this.verifyLocation(input, input.parsedOp.op.locationField)
      || !this.verifyOperand(input, input.parsedOp.op.addressField)) {
      return { lexedLine: input.lexedLine }
    }

    let parsed: AddressField | cusses.Cuss | undefined
    const operand = input.lexedLine.field3
    if (operand !== undefined) {
      parsed = parseAddressField(operand, ops.Necessity.Never, input.parsedOp.op === ERASE_OP)
    }
    if (cusses.isCuss(parsed)) {
      this.cardCusses.add(parsed)
      return { lexedLine: input.lexedLine }
    }

    const card: ClericalCard = {
      type: CardType.Clerical,
      location: input.location,
      operation: {
        operation: input.parsedOp.op, complimented: input.parsedOp.complimented, indexed: input.parsedOp.indexed
      },
      address: parsed,
      interpretive: pushDown
    }
    return { lexedLine: input.lexedLine, card }
  }

  parseNumericConstantCard (input: LineOp<ops.NumericConstant>): ParsedLine {
    this.verifyNotExtended()
    this.verifyNotStadr()

    if (input.parsedOp.complimented) {
      this.cardCusses.add(cusses.Cuss01)
    }

    if (!this.verifyOperand(input, ops.Necessity.Required)) {
      return { lexedLine: input.lexedLine }
    }

    if (input.lexedLine.field1 === 'NEARONE') {
      console.log('FOO')
    }
    const pushDown = this.popExplicit(input.parsedOp.op)
    const operand = input.lexedLine.field3 ?? ''
    const result = lexNumeric(input.parsedOp.op, input.parsedOp.indexed, operand, this.cardCusses)
    if (result === undefined) {
      return { lexedLine: input.lexedLine }
    }

    const card: NumericConstantCard = {
      type: CardType.Numeric,
      location: input.location,
      operation: { operation: input.parsedOp.op, complimented: false, indexed: false },
      highWord: result.highWord,
      lowWord: result.lowWord,
      interpretive: pushDown
    }
    return { lexedLine: input.lexedLine, card }
  }

  parseBasicInstruction (input: LineOp<ops.Basic>): ParsedLine {
    this.verifyNotStadr()

    if (input.parsedOp.op.isExtended) {
      if (!this.isExtended) {
        this.cardCusses.add(cusses.Cuss43)
      }
    } else if (input.parsedOp.op !== INDEX_OP) {
      this.verifyNotExtended()
    }
    this.popPushUp()

    if (input.parsedOp.indexed) {
      this.cardCusses.add(cusses.Cuss40)
    }

    if (!this.verifyOperand(input, input.parsedOp.op.addressField)) {
      return { lexedLine: input.lexedLine }
    }

    let address: AddressField | undefined
    const operand = input.lexedLine.field3
    if (operand !== undefined) {
      const parsed = parseAddressField(operand, ops.Necessity.Never, false)
      if (cusses.isCuss(parsed)) {
        this.cardCusses.add(parsed)
      } else {
        address = parsed
      }
    }

    if (input.parsedOp.op === EXTEND_OP) {
      this.isExtended = true
    } else if (input.parsedOp.op !== INDEX_OP) {
      this.isExtended = false
    }

    const card: BasicInstructionCard = {
      type: CardType.Basic,
      location: input.location,
      operation: { operation: input.parsedOp.op, complimented: input.parsedOp.complimented, indexed: false },
      address
    }
    return { lexedLine: input.lexedLine, card }
  }

  parseInterpretiveInstruction (input: LineOp<ops.Interpretive>): ParsedLine {
    this.verifyNotExtended()
    this.popPushUp()

    if (input.parsedOp.op.subType === ops.InterpretiveType.Store) {
      return this.parseStoreInstruction(input)
    }

    this.verifyNotStadr()
    this.validateInterpretiveOp(input.parsedOp)

    let rhsOperand: ParsedOp<ops.Interpretive> | undefined
    const operand = input.lexedLine.field3

    if (operand !== undefined) {
      const parsedOp = this.parseOp(operand)
      if (cusses.isCuss(parsedOp) || parsedOp.op.type !== ops.Type.Interpretive) {
        this.cardCusses.add(cusses.Cuss15)
      } else {
        rhsOperand = parsedOp as ParsedOp<ops.Interpretive>
        this.validateInterpretiveOp(rhsOperand)
      }
    }

    let lhs: OperationField<ops.Interpretive> | undefined
    let rhs: OperationField<ops.Interpretive> | undefined

    if (rhsOperand === undefined) {
      rhs = { operation: input.parsedOp.op, complimented: false, indexed: input.parsedOp.indexed }
      this.pushInterpretiveOperand(rhs, rhs.operation.operand2)
      this.pushInterpretiveOperand(rhs, rhs.operation.operand1)
    } else {
      lhs = { operation: input.parsedOp.op, complimented: false, indexed: input.parsedOp.indexed }
      rhs = { operation: rhsOperand.op, complimented: false, indexed: rhsOperand.indexed }
      if (input.parsedOp.op.rhs) {
        this.cardCusses.add(cusses.Cuss14)
      }
      this.pushInterpretiveOperand(rhs, rhs.operation.operand2)
      this.pushInterpretiveOperand(rhs, rhs.operation.operand1)
      this.pushInterpretiveOperand(lhs, lhs.operation.operand2)
      this.pushInterpretiveOperand(lhs, lhs.operation.operand1)
    }

    this.isStadr = rhs.operation === STADR_OP

    const card: InterpretiveInstructionCard = {
      type: CardType.Interpretive,
      location: input.location,
      lhs,
      rhs
    }
    return { lexedLine: input.lexedLine, card }
  }

  parseStoreInstruction (input: LineOp<ops.Interpretive>): ParsedLine {
    this.validateInterpretiveOp(input.parsedOp)

    const compliment = this.isStadr
    this.isStadr = false

    const operand = input.lexedLine.field3
    if (operand === undefined || input.parsedOp.op.operand1 === undefined) {
      // Every store instruction has at least one operand, second check above is just to remove warnings
      this.cardCusses.add(cusses.Cuss09)
      return { lexedLine: input.lexedLine }
    }

    // STORE can take an indexed first word but doesn't use '*', so always allow indexing for STORE.
    const isStore = input.parsedOp.op === STORE_OP
    // Others must have '*' set and be indexable on the first operand.
    const otherIndexable = (input.parsedOp.indexed && input.parsedOp.op.operand1.index)
    const indexable = isStore ? ops.Necessity.Optional : (otherIndexable ? ops.Necessity.Required : ops.Necessity.Never)
    const fieldParsed = parseAddressField(operand, indexable, false)
    if (cusses.isCuss(fieldParsed)) {
      this.cardCusses.add(fieldParsed)
      return { lexedLine: input.lexedLine }
    }

    // Set operator to indexed if it had a '*' or was a STORE with an indexed word.
    const indexed = input.parsedOp.indexed || fieldParsed.indexRegister !== undefined
    const lhs = { operation: input.parsedOp.op, complimented: compliment, indexed }
    this.pushInterpretiveOperand(lhs, input.parsedOp.op.operand2)

    const card: InterpretiveInstructionCard = {
      type: CardType.Interpretive,
      location: input.location,
      lhs,
      rhs: fieldParsed
    }
    return { lexedLine: input.lexedLine, card }
  }

  validateInterpretiveOp (parsedOp: ParsedOp<ops.Interpretive>): void {
    if (parsedOp.complimented) {
      this.cardCusses.add(cusses.Cuss06)
    }
    if (parsedOp.indexed) {
      const op1Indexed = parsedOp.op.operand1?.index ?? false
      const op2Indexed = parsedOp.op.operand2?.index ?? false
      if (!op1Indexed && !op2Indexed) {
        this.cardCusses.add(cusses.Cuss0A)
      }
    }
  }

  pushInterpretiveOperand (op: OperationField<ops.Interpretive>, operand: ops.InterpretiveOperand | undefined): void {
    if (operand !== undefined) {
      this.interpretiveOperands.push({ operator: op, operand })
    }
  }

  popExplicit (op: ops.Operation): OperandStackElement | undefined {
    let element: OperandStackElement | undefined
    let count = op.words
    const allowIndexed = op === IAW_OP
    while (count-- > 0) {
      const popped = this.interpretiveOperands.pop()
      if (popped === undefined) {
        break
      }
      element = popped
      if (!allowIndexed && element.operator.indexed) {
        this.cardCusses.add(cusses.Cuss17)
      }
    }
    return element
  }

  popPushUp (): void {
    let element: OperandStackElement | undefined
    while ((element = this.interpretiveOperands.pop()) !== undefined) {
      if (element.operator.indexed) {
        this.cardCusses.add(cusses.Cuss17)
      }
      if (!element.operand.pushDown) {
        this.cardCusses.add(cusses.Cuss0F)
      }
    }
  }

  verifyNotExtended (): void {
    if (this.isExtended) {
      this.cardCusses.add(cusses.Cuss44)
      this.isExtended = false
    }
  }

  verifyNotStadr (): void {
    if (this.isStadr) {
      this.cardCusses.add(cusses.Cuss11)
      this.isExtended = false
    }
  }

  verifyLocation (input: LineOp, necessity: ops.Necessity): boolean {
    if (necessity === ops.Necessity.Never) {
      if (input.lexedLine.field1 !== undefined) {
        this.cardCusses.add(cusses.Cuss48)
        return false
      }
    } else if (input.lexedLine.field1 === undefined) {
      if (necessity === ops.Necessity.Required) {
        this.cardCusses.add(cusses.Cuss47)
        return false
      }
    }
    return true
  }

  verifyOperand (input: LineOp, necessity: ops.Necessity): boolean {
    if (necessity === ops.Necessity.Never) {
      if (input.lexedLine.field3 !== undefined) {
        this.cardCusses.add(cusses.Cuss2B)
        return false
      }
    } else if (input.lexedLine.field3 === undefined) {
      if (necessity === ops.Necessity.Required) {
        this.cardCusses.add(cusses.Cuss56)
        return false
      }
    }
    return true
  }
}

function parseAddressField (
  field: string, interpretiveIndex: ops.Necessity, isErase: boolean): AddressField | cusses.Cuss {
  const match = interpretiveIndex !== ops.Necessity.Never
    ? INDEXED_FIELD_EXPR.exec(field)
    : ADDRESS_FIELD_EXPR.exec(field)
  if (match === null || match[1] === undefined) {
    if (isErase) {
      const rangeMatch = ERASE_FIELD_EXPR.exec(field)
      if (rangeMatch !== null) {
        const value1 = parseUnsigned(rangeMatch[1], MAX_ADDRESS)
        if (cusses.isCuss(value1)) {
          return value1
        }
        const value2 = parseUnsigned(rangeMatch[2], MAX_ADDRESS)
        if (cusses.isCuss(value2)) {
          return value2
        }

        if (value2 < value1) {
          return cusses.Cuss1E
        }
        const offset = value2 - value1
        return { value: value1, offset }
      }
    }
    return cusses.Cuss3D
  }

  let offset: number | undefined
  if (match[2] !== undefined) {
    const parsedSigned = parseSignedOffset(match[2])
    if (cusses.isCuss(parsedSigned)) {
      return parsedSigned
    } else {
      offset = parsedSigned
    }
  }

  let indexRegister: number | undefined
  if (interpretiveIndex !== ops.Necessity.Never) {
    // TODO: Have this function take both - whether indexing is possible, and whether it's required.
    // If not possible and indexed, return Cuss18
    if (match[3] === undefined) {
      if (interpretiveIndex === ops.Necessity.Required) {
        return cusses.Cuss17
      }
    } else {
      indexRegister = Number.parseInt(match[3])
    }
  }

  if (UNSIGNED_EXPR.test(match[1])) {
    const parsed = parseUnsigned(match[1], MAX_ADDRESS)
    if (cusses.isCuss(parsed)) {
      return parsed
    } else {
      return { value: parsed, offset, indexRegister }
    }
  }

  if (SIGNED_EXPR.test(match[1])) {
    const parsed = parseSignedOffset(match[1])
    if (cusses.isCuss(parsed)) {
      return parsed
    } else {
      return { value: { value: parsed }, offset, indexRegister }
    }
  }

  return { value: match[1], offset, indexRegister }
}

function parseSignedOffset (signed: string): number | cusses.Cuss {
  if (!SIGNED_EXPR.test(signed)) {
    return cusses.Cuss3D
  }

  const parsed = parseUnsigned(signed.substring(1), MAX_OFFSET)
  if (cusses.isCuss(parsed)) {
    return parsed
  }
  const isNegative = signed.charAt(0) === '-'
  return isNegative ? -parsed : parsed
}

function parseUnsigned (input: string, max: number): number | cusses.Cuss {
  let value: number

  if (input.charAt(input.length - 1) === 'D') {
    value = Number.parseInt(input.substring(0, input.length - 1), 10)
  } else if (!OCTAL_INTEGER_EXPR.test(input)) {
    return cusses.Cuss21
  } else {
    value = Number.parseInt(input, 8)
  }

  if (value > max) {
    return cusses.Cuss3F
  }

  return value
}
