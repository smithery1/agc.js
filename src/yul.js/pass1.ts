import { compat } from '../common/compat'
import * as field from './address-field'
import * as addressing from './addressing'
import { AssembledCard, getCusses } from './assembly'
import { Mode, Options } from './bootstrap'
import { Cells } from './cells'
import * as cusses from './cusses'
import { LineType } from './lexer'
import * as ops from './operations'
import * as parse from './parser'
import { Pass1SymbolTable, Pass2SymbolTable } from './symbol-table'

/**
 * The output from pass 1 assembly.
 * Contains a card per significant input line (remark or code), the symbol table ready for pass 2, and the cells with
 * cards but not values assigned.
 *
 * The cards are returned in input order, not memory order.
 */
export interface Pass1Output {
  readonly cards: AssembledCard[]
  readonly symbolTable: Pass2SymbolTable
  readonly cells: Cells
}

const EQUALS_MINUS_OP = ops.requireOperation('=MINUS')
const EQUALS_PLUS_OP = ops.requireOperation('=PLUS')

/**
 * The pass 1 assembler.
 * - Lexes and parses each input line into an AssembledCard
 * - Assigns each such card that defines a memory word to its proper address in a Cells class
 * - Associates location field symbols with their addresses in the symbol table
 * - Associates EQUALS symbols with their values in the symbol table
 */
export class Pass1Assembler {
  private readonly cardDispatch = {
    [parse.CardType.Basic]: this.onBasicInstructionCard.bind(this),
    [parse.CardType.Interpretive]: this.onInterpretiveInstructionCard.bind(this),
    [parse.CardType.Clerical]: this.onClericalCard.bind(this),
    [parse.CardType.Address]: this.onAddressConstantCard.bind(this),
    [parse.CardType.Numeric]: this.onNumericConstantCard.bind(this)
  }

  private readonly clericalDispatch = {
    '=ECADR': this.onEqualsEcadrCard.bind(this),
    '=MINUS': this.onEqualsLikeCard.bind(this),
    '=PLUS': this.onEqualsLikeCard.bind(this),
    BANK: this.onBankCard.bind(this),
    BLOCK: this.onBlockCard.bind(this),
    ERASE: this.onEraseCard.bind(this),
    EQUALS: this.onEqualsLikeCard.bind(this),
    SETLOC: this.onSetLocCard.bind(this)
  }

  private symbolTable: Pass1SymbolTable
  private cards: AssembledCard[]
  private cells: Cells
  private urlBase: string
  private locationCounter: number | undefined
  private hadLocationCounter: boolean

  constructor (private readonly options: Options) {
  }

  /**
   * Runs this assembler on the specified URL, which typically points to a MAIN.agc yaYUL formatted file.
   *
   * @param mainUrl the URL of the starting file
   * @returns the pass 1 output, or a cuss if there was an error reading a URL
   */
  async assemble (mainUrl: string): Promise<Pass1Output | cusses.CussInstance> {
    const index = mainUrl.lastIndexOf('/')
    if (index < 0) {
      return { cuss: cusses.Cuss2A, context: [mainUrl] }
    }
    this.symbolTable = new Pass1SymbolTable()
    this.cards = []
    this.cells = new Cells()
    this.urlBase = mainUrl.substring(0, index)
    this.hadLocationCounter = false

    const parser = new parse.Parser()
    let symbolTable: Pass2SymbolTable

    try {
      const result = await this.assembleFile(mainUrl, parser)
      if (result !== undefined) {
        return result
      }
      symbolTable = this.symbolTable.resolveAll()
    } catch (error) {
      return { cuss: cusses.Cuss2A, error, context: [mainUrl] }
    }

    return { cards: this.cards, symbolTable, cells: this.cells }
  }

  private async assembleFile (url: string, parser: parse.Parser): Promise<cusses.CussInstance | undefined> {
    const stream = await compat.fetch(url)

    for await (const parsedCard of parser.parse(url, stream)) {
      const card = parsedCard.card
      if (card === undefined) {
        if (parsedCard.lexedLine.type === LineType.Pagination) {
          this.outputPagination(parsedCard)
        } else {
          this.outputErrorLine(parsedCard)
        }
      } else {
        if (parse.isInsertion(card)) {
          const result = await this.insertSource(card, parser)
          if (result !== undefined) {
            return result
          }
        } else if (parse.isRemark(card)) {
          this.outputRemarkCard(parsedCard)
        } else {
          this.assembleCard(parsedCard)
        }
      }
    }
  }

  private outputPagination (parsedCard: parse.ParsedCard): void {
    this.cards.push({
      lexedLine: parsedCard.lexedLine,
      extent: 0,
      count: 0,
      eBank: 0,
      sBank: 0,
      cusses: parsedCard.cusses
    })
  }

  private outputErrorLine (parsedCard: parse.ParsedCard): void {
    this.cards.push({
      lexedLine: parsedCard.lexedLine,
      extent: 0,
      count: 0,
      eBank: 0,
      sBank: 0,
      cusses: parsedCard.cusses
    })
  }

  private outputRemarkCard (parsedCard: parse.ParsedCard): void {
    const assembled: AssembledCard = {
      lexedLine: parsedCard.lexedLine,
      card: parsedCard.card,
      extent: 0,
      count: 0,
      eBank: 0,
      sBank: 0
    }
    this.cards.push(assembled)
  }

  private async insertSource (
    card: parse.InsertionCard, parser: parse.Parser): Promise<cusses.CussInstance | undefined> {
    const insertedUrl = this.urlBase + '/' + card.file
    try {
      const result = await this.assembleFile(insertedUrl, parser)
      if (result !== undefined) {
        return result
      }
    } catch (error) {
      return { cuss: cusses.Cuss2A, error, context: [insertedUrl] }
    }
  }

  private assembleCard (parsedCard: parse.ParsedCard): void {
    const card = parsedCard.card as parse.AssemblyCard
    const cardCusses = new cusses.Cusses()
    cardCusses.addAll(parsedCard.cusses)
    const assembled: AssembledCard = {
      lexedLine: parsedCard.lexedLine,
      card,
      extent: 0,
      count: 0,
      eBank: 0,
      sBank: 0,
      cusses: cardCusses
    }

    assembled.extent = 0
    this.cardDispatch[card.type](card, assembled)
    this.assignCells(assembled)
    assembled.cusses = cardCusses.empty() ? undefined : cardCusses
    this.cards.push(assembled)
    if ((assembled.refAddress ?? -1) === this.locationCounter) {
      this.setLocationCounter(this.locationCounter + assembled.extent)
    }
  }

  private setLocationCounter (newLocationCounter: number | undefined): void {
    this.locationCounter = newLocationCounter
    this.hadLocationCounter = true
  }

  private validateLocationCounter (counter: number | undefined, assembled: AssembledCard): counter is number {
    if (counter !== undefined) {
      return true
    }
    if (!this.hadLocationCounter) {
      getCusses(assembled).add(cusses.Cuss27, 'Location not yet set')
    }
    return false
  }

  private assignCells (assembled: AssembledCard): void {
    if (assembled.refAddress !== undefined && assembled.extent > 0) {
      for (let i = assembled.refAddress; i < assembled.refAddress + assembled.extent; i++) {
        this.cells.assignDefinition(i, assembled)
      }
    }
  }

  private checkBankFull (words: number, assembled: AssembledCard): void {
    if (words > 0 && this.locationCounter === undefined) {
      getCusses(assembled).add(cusses.Cuss4F)
    }
  }

  private onBasicInstructionCard (
    card: parse.BasicInstructionCard, assembled: AssembledCard): void {
    this.checkBankFull(card.operation.operation.words, assembled)
    assembled.refAddress = this.locationCounter
    assembled.extent = card.operation.operation.words
    this.symbolTable.assignAddress(card.location, assembled)
  }

  private onInterpretiveInstructionCard (
    card: parse.InterpretiveInstructionCard, assembled: AssembledCard): void {
    this.checkBankFull(1, assembled)
    assembled.refAddress = this.locationCounter
    assembled.extent = 1
    this.symbolTable.assignAddress(card.location, assembled)
  }

  private onAddressConstantCard (
    card: parse.AddressConstantCard, assembled: AssembledCard): void {
    this.checkBankFull(card.operation.operation.words, assembled)
    assembled.refAddress = this.locationCounter
    assembled.extent = card.operation.operation.words
    this.symbolTable.assignAddress(card.location, assembled)
  }

  private onNumericConstantCard (
    card: parse.NumericConstantCard, assembled: AssembledCard): void {
    this.checkBankFull(card.operation.operation.words, assembled)
    assembled.refAddress = this.locationCounter
    assembled.extent = card.operation.operation.words
    this.symbolTable.assignAddress(card.location, assembled)
  }

  private onClericalCard (card: parse.ClericalCard, assembled: AssembledCard): void {
    this.checkBankFull(card.operation.operation.words, assembled)

    const symbol = card.operation.operation.symbol
    if (symbol in this.clericalDispatch) {
      this.clericalDispatch[symbol](card, assembled)
    } else {
      assembled.refAddress = this.locationCounter
      assembled.extent = card.operation.operation.words
      if (card.operation.operation.words > 0) {
        this.symbolTable.assignAddress(card.location, assembled)
      }
    }
  }

  private onSetLocCard (card: parse.ClericalCard, assembled: AssembledCard): void {
    if (card.address !== undefined) {
      const resolved = field.resolve(card.address, this.locationCounter, assembled, this.symbolTable)
      if (resolved !== undefined) {
        assembled.refAddress = resolved.address + resolved.offset
        assembled.extent = 0
        this.setLocationCounter(assembled.refAddress)
      }
    }
  }

  private onBankCard (card: parse.ClericalCard, assembled: AssembledCard): void {
    let bankNumber: number
    let sBank: number | undefined

    // Ref SYM, III-8
    // Note that only references to S3 and S4 change SBANK, references to non-superbank addresses leave it alone.

    if (card.address === undefined) {
      const fixed = addressing.fixedBankNumber(this.locationCounter ?? -1)
      if (fixed === undefined) {
        getCusses(assembled).add(cusses.Cuss3F)
        return
      }
      bankNumber = fixed
      sBank = addressing.fixedBankNumberToBank(bankNumber)?.sBank
    } else {
      if (typeof card.address?.value !== 'number') {
        getCusses(assembled).add(cusses.Cuss3F)
        return
      }

      bankNumber = card.address.value
      if (bankNumber === 2 || bankNumber === 3) {
        getCusses(assembled).add(cusses.Cuss3F)
        return
      }

      // The following differing YUL vs GAP behavior for BANK with an operand is empirical
      // but works to compile all code.
      // YUL: Behaves like BANK with no operand
      // GAP: Leaves SBANK unchanged
      if (this.options.mode === Mode.Yul) {
        sBank = addressing.fixedBankNumberToBank(bankNumber)?.sBank
      }
    }

    const bankRange = addressing.fixedBankRange(bankNumber)
    if (bankRange === undefined) {
      getCusses(assembled).add(cusses.Cuss3F)
      return
    }

    const address = this.cells.findFree(bankRange)
    if (address !== undefined) {
      assembled.refAddress = address
      assembled.sBank = sBank ?? 0
      assembled.extent = 0
      this.setLocationCounter(address)
    } else {
      getCusses(assembled).add(cusses.Cuss4F, 'Ignoring instructions until next SETLOC/BANK/BLOCK')
      this.setLocationCounter(undefined)
    }
  }

  private onBlockCard (card: parse.ClericalCard, assembled: AssembledCard): void {
    if (typeof card.address?.value !== 'number') {
      getCusses(assembled).add(cusses.Cuss3F)
      return
    }

    const bankNumber = card.address.value
    if (bankNumber !== 2 && bankNumber !== 3) {
      getCusses(assembled).add(cusses.Cuss3F)
      return
    }

    const bankRange = addressing.fixedBankRange(bankNumber)
    if (bankRange === undefined) {
      getCusses(assembled).add(cusses.Cuss3F)
      return
    }

    const address = this.cells.findFree(bankRange)
    if (address !== undefined) {
      assembled.refAddress = address
      assembled.extent = 0
      this.setLocationCounter(address)
    } else {
      getCusses(assembled).add(cusses.Cuss4F, 'Ignoring instructions until next SETLOC/BANK/BLOCK')
      this.setLocationCounter(undefined)
    }
  }

  private onEraseCard (card: parse.ClericalCard, assembled: AssembledCard): void {
    if (card.address === undefined) {
      assembled.refAddress = this.locationCounter
      assembled.extent = 1
    } else {
      // ERASE addressing is special: X +N means X -> X + N
      let start = this.locationCounter
      let extent = 1 + (card.address.offset ?? 0)

      if (typeof card.address.value === 'number') {
        start = card.address.value
      } else if (typeof card.address.value === 'string') {
        const result = this.symbolTable.resolve(card.address.value, assembled)
        if (result === undefined) {
          getCusses(assembled).add(cusses.Cuss2D)
          return
        } else {
          start = result
        }
      } else {
        if (card.address.offset === undefined) {
          extent = card.address.value.value + 1
        } else if (this.validateLocationCounter(this.locationCounter, assembled)) {
          start = this.locationCounter + card.address.value.value
        } else {
          return
        }
      }

      if (start === undefined) {
        // Location required but have none due to bad BANK/BLOCK previously
        return
      }

      if (!canErase(addressing.memoryArea(start))
        || !canErase(addressing.memoryArea(start + extent - 1))) {
        getCusses(assembled).add(cusses.Cuss3F)
        return
      }

      assembled.refAddress = start
      assembled.extent = extent
    }

    this.symbolTable.assignAddress(card.location, assembled)

    function canErase (area: addressing.MemoryArea): boolean {
      return area === addressing.MemoryArea.Unswitched_Banked_Erasable
          || area === addressing.MemoryArea.Switched_Erasable
    }
  }

  private onEqualsEcadrCard (card: parse.ClericalCard, assembled: AssembledCard): void {
    // Address will be replaced in pass2, but need to flag it as having an address so it's processed in that pass.
    assembled.refAddress = 0
  }

  private onEqualsLikeCard (card: parse.ClericalCard, assembled: AssembledCard): void {
    // Required for relative declarations
    assembled.refAddress = this.locationCounter
    if (card.address === undefined) {
      if (this.validateLocationCounter(this.locationCounter, assembled)) {
        this.symbolTable.assignAddress(card.location, assembled)
      }
    } else {
      let offset = 0
      if ((card.operation.operation === EQUALS_MINUS_OP || card.operation.operation === EQUALS_PLUS_OP)
        && this.validateLocationCounter(this.locationCounter, assembled)) {
        offset = this.locationCounter
        if (card.operation.operation === EQUALS_MINUS_OP) {
          offset = -offset
        }
      }
      this.symbolTable.assignField(card.location, card.address, offset, assembled)
    }
  }
}
