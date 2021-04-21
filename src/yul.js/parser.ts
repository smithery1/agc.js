import { InputStream } from '../common/compat'
import * as field from './address-field'
import { Options } from './bootstrap'
import * as cusses from './cusses'
import { lex, LexedLine, LineType } from './lexer'
import { lexNumeric } from './numeric-card'
import * as ops from './operations'
import { isWhitespace } from './util'

/**
 * A parsed location field.
 * Contains a symbol.
 */
export interface LocationField {
  readonly symbol: string
}

/**
 * A parsed operation field.
 * Contains an instruction and whether it is complemented (prefixed with '-') and indexed (suffixed with '*').
 */
export interface OperationField<OperationType = ops.Operation> {
  readonly operation: OperationType
  readonly complemented: boolean
  readonly indexed: boolean
}

/**
 * A parsed numeric constant card field.
 */
export interface NumericConstantField {
  readonly highWord?: number
  readonly lowWord: number
}

/**
 * The type of parsed card.
 */
export enum CardType {
  Insertion,
  Remark,
  Basic,
  Interpretive,
  Numeric,
  Address,
  Clerical
}

/**
 * A parsed yaYUL insertion card.
 * Contains the name of the file to insert.
 */
export interface InsertionCard {
  readonly type: CardType.Insertion
  readonly file: string
}

/**
 * A parsed remark (comment) card.
 * Specifies whether the comment text started at the beginning of the line, or was preceded by whitespace.
 * This can be used when formatting the remark for output.
 */
export interface RemarkCard {
  readonly type: CardType.Remark
  readonly fullLine: boolean
}

/**
 * A base parsed assembly card.
 * Contains an optional location field.
 */
export interface AssemblyCard {
  readonly type: CardType
  readonly location?: LocationField
}

/**
 * An instruction card for a basic operation.
 * Contains the operation and an optional address.
 */
export interface BasicInstructionCard extends AssemblyCard {
  readonly type: CardType.Basic
  readonly operation: OperationField<ops.Basic>
  readonly address?: field.AddressField
}

/**
 * An instruction card for an interpretive operation line.
 * Contains one of the following.
 * - An LHS operation and an address field.
 * - An LHS operation and an RHS operation.
 * - An RHS operation only.
 */
export interface InterpretiveInstructionCard extends AssemblyCard {
  readonly type: CardType.Interpretive
  readonly lhs?: OperationField<ops.Interpretive>
  readonly rhs?: OperationField<ops.Interpretive> | field.AddressField
}

/**
 * A numeric constant card.
 * Contains the operation, a reference to an interpretive operation if this card represents an IAW, and the address
 * field as parsed numeric word(s).
 * The high word is populated if the operation is double precision.
 */
export interface NumericConstantCard extends AssemblyCard {
  readonly type: CardType.Numeric
  readonly operation: OperationField<ops.NumericConstant>
  readonly interpretive?: OperandStackElement
  readonly highWord?: number
  readonly lowWord: number
}

/**
 * An address constant card.
 * Contains the operation, a reference to an interpretive operation if this card represents an IAW, and the address
 * field.
 */
export interface AddressConstantCard extends AssemblyCard {
  readonly type: CardType.Address
  readonly operation: OperationField<ops.AddressConstant>
  readonly interpretive?: OperandStackElement
  readonly address?: field.AddressField
}

/**
 * A clerical card.
 * Contains the operation, a reference to an interpretive operation if this card represents an IAW, and the address
 * field.
 */
export interface ClericalCard extends AssemblyCard {
  readonly type: CardType.Clerical
  readonly operation: OperationField<ops.Clerical>
  readonly interpretive?: OperandStackElement
  readonly address?: field.AddressField
}

export function isAddressConstant (card: any): card is AddressConstantCard {
  return cardIsOfType(card, CardType.Address)
}

export function isBasic (card: any): card is BasicInstructionCard {
  return cardIsOfType(card, CardType.Basic)
}

export function isClerical (card: any): card is ClericalCard {
  return cardIsOfType(card, CardType.Clerical)
}

export function isInterpretive (card: any): card is InterpretiveInstructionCard {
  return cardIsOfType(card, CardType.Interpretive)
}

export function isNumericConstant (card: any): card is NumericConstantCard {
  return cardIsOfType(card, CardType.Numeric)
}

export function isInsertion (card: any): card is InsertionCard {
  return cardIsOfType(card, CardType.Insertion)
}

export function isRemark (card: any): card is RemarkCard {
  return cardIsOfType(card, CardType.Remark)
}

export function hasAddressField (card: any): card is AddressConstantCard | BasicInstructionCard | ClericalCard {
  return isBasic(card) || isClerical(card) || isAddressConstant(card)
}

export function cardIsOfType (card: any, type: CardType): boolean {
  return 'type' in (card ?? {}) && card.type === type
}

/**
 * The parser output.
 * Contains the lexed line, an optional card, and optional cusses.
 * If the line could not be parsed, the reason(s) are in the the cusses and the card field is undefined.
 * If the line could be parsed, the card field is defined.
 * There may still be cusses present in this case if they were considered non-fatal.
 */
export interface ParsedCard {
  lexedLine: LexedLine
  card?: any
  cusses?: cusses.Cusses
}

/**
 * An interpretive operand.
 * Provided with explicit IAW cards for the assembler to use.
 */
export interface OperandStackElement {
  operator: OperationField<ops.Interpretive>
  operand: ops.InterpretiveOperand
}

interface ParsedOp<OperationType = ops.Operation> {
  readonly op: OperationType
  readonly complemented: boolean
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

/**
 * The parser.
 *
 * The parser output is in the form of parsed "card" objects, which contain information about a source line.
 * See Ref YUL and operations.ts for more on the various cards and their operations.
 *
 * The general rule is that the parser verifies proper requirements and syntax but does not deal with addressing, which
 * is left to the assembler.
 * - Required fields are present, disallowed fields are not
 * - Extended instructions are preceded by EXTEND
 * - Interpretive operations have proper matching IAW fields, either explicit or push-up
 * - Interpretive store operations are preceded by STADR if necessary
 *
 * Errors result in cusses added to the parsed card object, and the object contains a card only if the card parsed
 * properly.
 * This means assembler passes can assume that any cards they receive are well formed and do not need to double-check
 * for lexing or parsing errors.
 */
export class Parser {
  private readonly opDispatch = {
    [ops.Type.Basic]: this.parseBasicInstruction.bind(this),
    [ops.Type.Interpretive]: this.parseInterpretiveInstruction.bind(this),
    [ops.Type.Clerical]: this.parseClericalCard.bind(this),
    [ops.Type.Address]: this.parseAddressConstantCard.bind(this),
    [ops.Type.Numeric]: this.parseNumericConstantCard.bind(this)
  }

  private readonly interpretiveOperands: OperandStackElement[]
  private page: number
  private isExtended: boolean
  private isStadr: boolean
  private cardCusses: cusses.Cusses

  constructor (private readonly operations: ops.Operations, private readonly options: Options) {
    this.interpretiveOperands = []
    this.page = 0
    this.isExtended = false
    this.isStadr = false
    this.cardCusses = new cusses.Cusses()
  }

  /**
   * Reads the specified input stream and emits parsed card data.
   *
   * @param source the name of the input source
   * @param stream the input source
   */
  async * parse (source: string, stream: InputStream): AsyncGenerator<ParsedCard> {
    for await (const lexed of lex(source, stream)) {
      let localCusses: cusses.Cusses | undefined

      if (lexed.sourceLine.page !== 0 && lexed.sourceLine.page !== this.page) {
        if (lexed.sourceLine.page !== this.page + 1) {
          this.cardCusses.add(cusses.Cuss27, `Expected page ${this.page} but got ${lexed.sourceLine.page}`)
          localCusses = this.cardCusses
        }
        this.page = lexed.sourceLine.page
      }
      if (lexed.type === LineType.Insertion) {
        yield { lexedLine: lexed, card: { type: CardType.Insertion, file: lexed.field1 }, cusses: localCusses }
      } else if (lexed.type === LineType.Remark) {
        yield {
          lexedLine: lexed,
          cusses: localCusses,
          card: { type: CardType.Remark, fullLine: lexed.field1 === undefined }
        }
      } else if (lexed.type === LineType.Pagination) {
        yield { lexedLine: lexed, cusses: localCusses }
      } else {
        const parsedLine = this.parseCard(lexed)
        localCusses = this.cardCusses.empty() ? undefined : this.cardCusses
        if (localCusses !== undefined) {
          this.cardCusses = new cusses.Cusses()
        }
        yield ({ lexedLine: parsedLine.lexedLine, card: parsedLine.card, cusses: localCusses })
      }
    }
  }

  private parseCard (lexedLine: LexedLine): ParsedLine {
    if (lexedLine.field1 !== undefined && lexedLine.field2 === undefined && lexedLine.field3 === undefined) {
      this.cardCusses.add(cusses.Cuss41, 'Operation field is blank')
      return { lexedLine }
    }

    const parsedLocation = this.parseLocation(lexedLine.field1)
    const location = parsedLocation.location

    const operationField = lexedLine.field2 === undefined ? '' : lexedLine.field2
    const parsedOp = this.parseOp(operationField)
    if (cusses.isCuss(parsedOp)) {
      this.cardCusses.add(parsedOp, operationField)
      return { lexedLine }
    }

    const dispatching: LineOp = { lexedLine, location, parsedOp }
    return this.opDispatch[parsedOp.op.type](dispatching)
  }

  private parseLocation (token?: string): { location?: LocationField } {
    if (token === undefined) {
      return {}
    }

    token = token.trim()
    if (token.length === 0) {
      return {}
    }

    if (field.SIGNED_EXPR.test(token)) {
      return {}
    }

    if (field.UNSIGNED_EXPR.test(token)) {
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

  private parseOp (field: string): ParsedOp | cusses.Cuss {
    let input = field
    const complemented = input.charAt(0) === '-'
    const indexed = input.charAt(input.length - 1) === '*'
    if (complemented) {
      input = input.substring(1)
    }
    if (indexed) {
      input = input.substring(0, input.length - 1)
    }

    let op = this.operations.operation(input)
    if (op === undefined) {
      return cusses.Cuss41
    }
    // Adjust to extended index if necessary
    op = this.operations.checkExtendedIndex(op, this.isExtended)
    // Adjust to interpreter store indexed if necessary
    op = this.operations.checkIndexedStore(op, indexed)

    return { op, complemented, indexed }
  }

  private parseAddressConstantCard (input: LineOp<ops.AddressConstant>): ParsedLine {
    this.verifyNotExtended()
    this.verifyNotStadr()

    const operand = input.lexedLine.field3
    // Ref SYM, IIF-5. Special case for BBCON* for checksumming routine.
    const isBbconStar = input.parsedOp.indexed && input.parsedOp.op === this.operations.BBCON
    // BBCON* and certain Agora-era cards have an undefined address field
    const operandNecessity = isBbconStar ? ops.Necessity.Never : input.parsedOp.op.addressField

    if (isBbconStar) {
      if (input.parsedOp.complemented) {
        this.cardCusses.add(cusses.Cuss01)
      }
    } else {
      if (input.parsedOp.indexed) {
        this.cardCusses.add(cusses.Cuss40)
      }
    }

    if (!this.verifyAddressField(input, operandNecessity)) {
      return { lexedLine: input.lexedLine }
    }

    const pushDown = this.popExplicit(input.parsedOp.op)
    let parsed: field.AddressField | undefined
    if (operand !== undefined) {
      if (input.parsedOp.op === this.operations.P) {
        if (pushDown === undefined) {
          this.cardCusses.add(cusses.Cuss0E)
          parsed = field.parse(operand, ops.Necessity.Never, false, this.cardCusses)
        } else {
          const indexed = pushDown.operator.indexed && pushDown.operand.indexable
          const indexedNecessity = indexed ? ops.Necessity.Required : ops.Necessity.Never
          parsed = field.parse(operand, indexedNecessity, false, this.cardCusses)
        }
      } else {
        parsed = field.parse(operand, ops.Necessity.Never, false, this.cardCusses)
      }

      if (parsed === undefined) {
        return { lexedLine: input.lexedLine }
      }
    }

    const card: AddressConstantCard = {
      type: CardType.Address,
      location: input.location,
      operation: {
        operation: input.parsedOp.op, complemented: input.parsedOp.complemented, indexed: input.parsedOp.indexed
      },
      address: parsed,
      interpretive: pushDown
    }
    return { lexedLine: input.lexedLine, card }
  }

  private parseClericalCard (input: LineOp<ops.Clerical>): ParsedLine {
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
      // Let's also not allow clerical operations like SETLOC in the middle of an IIW / IAW pair
      this.cardCusses.add(cusses.Cuss0F)
    }

    if (input.parsedOp.complemented && input.parsedOp.op.complement === ops.Necessity.Never) {
      this.cardCusses.add(cusses.Cuss01)
    }
    if (input.parsedOp.indexed && input.parsedOp.op.index === ops.Necessity.Never) {
      this.cardCusses.add(cusses.Cuss40)
    }

    if (!this.verifyLocation(input, input.parsedOp.op.locationField)
      || !this.verifyAddressField(input, input.parsedOp.op.addressField)) {
      return { lexedLine: input.lexedLine }
    }

    let parsed: field.AddressField | undefined
    const addressField = input.lexedLine.field3
    if (addressField !== undefined) {
      if (input.parsedOp.op === this.operations.SUBRO) {
        parsed = { value: addressField }
      } else {
        const rangeAllowed = input.parsedOp.op === this.operations.ERASE || input.parsedOp.op === this.operations.MEMORY
        parsed = field.parse(addressField, ops.Necessity.Never, rangeAllowed, this.cardCusses)
      }
      if (parsed === undefined) {
        return { lexedLine: input.lexedLine }
      }
    }

    const card: ClericalCard = {
      type: CardType.Clerical,
      location: input.location,
      operation: {
        operation: input.parsedOp.op, complemented: input.parsedOp.complemented, indexed: input.parsedOp.indexed
      },
      address: parsed,
      interpretive: pushDown
    }
    return { lexedLine: input.lexedLine, card }
  }

  private parseNumericConstantCard (input: LineOp<ops.NumericConstant>): ParsedLine {
    this.verifyNotExtended()
    this.verifyNotStadr()

    if (input.parsedOp.complemented) {
      this.cardCusses.add(cusses.Cuss01)
    }

    if (!this.verifyAddressField(input, ops.Necessity.Required)) {
      return { lexedLine: input.lexedLine }
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
      operation: { operation: input.parsedOp.op, complemented: false, indexed: false },
      highWord: result.highWord,
      lowWord: result.lowWord,
      interpretive: pushDown
    }
    return { lexedLine: input.lexedLine, card }
  }

  private parseBasicInstruction (input: LineOp<ops.Basic>): ParsedLine {
    this.verifyNotStadr()

    if (input.parsedOp.op.isExtended) {
      if (!this.isExtended) {
        this.cardCusses.add(cusses.Cuss43)
      }
    } else {
      this.verifyNotExtended()
    }
    this.popPushUp()

    if (input.parsedOp.indexed) {
      this.cardCusses.add(cusses.Cuss40)
    }

    if (!this.verifyAddressField(input, input.parsedOp.op.addressField)) {
      return { lexedLine: input.lexedLine }
    }

    let address: field.AddressField | undefined
    const operand = input.lexedLine.field3
    if (operand !== undefined) {
      address = field.parse(operand, ops.Necessity.Never, false, this.cardCusses)
    }

    this.isExtended = input.parsedOp.op === this.operations.EXTEND
      || input.parsedOp.op === this.operations.EXTENDED_INDEX

    const card: BasicInstructionCard = {
      type: CardType.Basic,
      location: input.location,
      operation: { operation: input.parsedOp.op, complemented: input.parsedOp.complemented, indexed: false },
      address
    }
    return { lexedLine: input.lexedLine, card }
  }

  private parseInterpretiveInstruction (input: LineOp<ops.Interpretive>): ParsedLine {
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
        this.cardCusses.add(cusses.Cuss15, operand)
      } else {
        rhsOperand = parsedOp as ParsedOp<ops.Interpretive>
        this.validateInterpretiveOp(rhsOperand)
      }
    }

    let lhs: OperationField<ops.Interpretive> | undefined
    let rhs: OperationField<ops.Interpretive> | undefined

    if (rhsOperand === undefined) {
      rhs = { operation: input.parsedOp.op, complemented: false, indexed: input.parsedOp.indexed }
      this.pushInterpretiveOperand(rhs, rhs.operation.operand2)
      this.pushInterpretiveOperand(rhs, rhs.operation.operand1)
    } else {
      lhs = { operation: input.parsedOp.op, complemented: false, indexed: input.parsedOp.indexed }
      rhs = { operation: rhsOperand.op, complemented: false, indexed: rhsOperand.indexed }
      if (input.parsedOp.op.rhs) {
        this.cardCusses.add(cusses.Cuss14)
      }
      this.pushInterpretiveOperand(rhs, rhs.operation.operand2)
      this.pushInterpretiveOperand(rhs, rhs.operation.operand1)
      this.pushInterpretiveOperand(lhs, lhs.operation.operand2)
      this.pushInterpretiveOperand(lhs, lhs.operation.operand1)
    }

    this.isStadr = rhs.operation === this.operations.STADR

    const card: InterpretiveInstructionCard = {
      type: CardType.Interpretive,
      location: input.location,
      lhs,
      rhs
    }
    return { lexedLine: input.lexedLine, card }
  }

  private parseStoreInstruction (input: LineOp<ops.Interpretive>): ParsedLine {
    this.validateInterpretiveOp(input.parsedOp)

    const complemented = this.isStadr
    this.isStadr = false

    const operand = input.lexedLine.field3
    if (operand === undefined || input.parsedOp.op.operand1 === undefined) {
      // Every store instruction has at least one operand, second check above is just to remove warnings
      this.cardCusses.add(cusses.Cuss09)
      return { lexedLine: input.lexedLine }
    }

    // STORE and BLK2 STODL and STOVL can take an indexed first word but don't use '*', so allow indexing for them.
    const indexNecessity = this.operations.storeFirstWordIndexable(input.parsedOp.op)
    const fieldParsed = field.parse(operand, indexNecessity, false, this.cardCusses)
    if (fieldParsed === undefined) {
      return { lexedLine: input.lexedLine }
    }

    let operation = input.parsedOp.op
    // Set operator to the indexed one if the address was indexed
    if (fieldParsed.indexRegister !== undefined) {
      operation = this.operations.storeFirstWordIndexed(input.parsedOp.op, fieldParsed.indexRegister)
    }
    const lhs = { operation, complemented, indexed: input.parsedOp.indexed }
    this.pushInterpretiveOperand(lhs, operation.operand2)

    const card: InterpretiveInstructionCard = {
      type: CardType.Interpretive,
      location: input.location,
      lhs,
      rhs: fieldParsed
    }
    return { lexedLine: input.lexedLine, card }
  }

  validateInterpretiveOp (parsedOp: ParsedOp<ops.Interpretive>): void {
    if (parsedOp.complemented) {
      this.cardCusses.add(cusses.Cuss06)
    }
    if (parsedOp.indexed) {
      const op1Indexable = parsedOp.op.operand1?.indexable ?? false
      const op2Indexable = parsedOp.op.operand2?.indexable ?? false
      if (!op1Indexable && !op2Indexable) {
        this.cardCusses.add(cusses.Cuss0A)
      }
    }
  }

  private pushInterpretiveOperand (
    op: OperationField<ops.Interpretive>, operand: ops.InterpretiveOperand | undefined): void {
    if (operand !== undefined) {
      this.interpretiveOperands.push({ operator: op, operand })
    }
  }

  private popExplicit (op: ops.Operation): OperandStackElement | undefined {
    let element: OperandStackElement | undefined
    let count = op.words
    const allowIndexed = op === this.operations.P
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

  private popPushUp (): void {
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

  private verifyNotExtended (): void {
    if (this.isExtended) {
      this.cardCusses.add(cusses.Cuss44)
      this.isExtended = false
    }
  }

  private verifyNotStadr (): void {
    if (this.isStadr) {
      this.cardCusses.add(cusses.Cuss11)
      this.isExtended = false
    }
  }

  private verifyLocation (input: LineOp, necessity: ops.Necessity): boolean {
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

  private verifyAddressField (input: LineOp, necessity: ops.Necessity): boolean {
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
