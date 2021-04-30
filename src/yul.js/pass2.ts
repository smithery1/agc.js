import * as field from './address-field'
import { AssembledCard, COMPLEMENT_MASK, ERROR_WORD, getCusses } from './assembly'
import { Options } from './bootstrap'
import { Cells } from './cells'
import * as cusses from './cusses'
import { LineType, SourceLine } from './lexer'
import { Bank, Memory, MemoryType } from './memory'
import * as ops from './operations'
import { BasicAddressRange } from './operations'
import * as parse from './parser'
import { Pass1Output } from './pass1'
import { Pass2SymbolTable } from './symbol-table'
import * as versions from './versions'

/**
 * The output from pass 2 assembly.
 * Contains a card per significant input line (remark or code), the symbol table, and the cells with all values
 * assigned.
 * Also counts a summary count of fatal and non-fatal cusses.
 *
 * The cards are returned in input order, not memory order.
 */
export interface Pass2Output {
  readonly cards: AssembledCard[]
  readonly symbolTable: Pass2SymbolTable
  readonly cells: Cells
  fatalCussCount: number
  nonFatalCussCount: number
}

interface BnkSum {
  readonly definition: AssembledCard
  readonly bank: number
  readonly startAddress: number
  readonly sumAddress: number
}

/**
 * The pass 2 assembler.
 * - Calculates the binary value for each assigned memory cell
 * - Generates BNKSUM TC operations and checksums
 * - Tracks EBANK= and SBANK= settings, and validates against them
 */
export class Pass2Assembler {
  private readonly cardDispatch = {
    [parse.CardType.Basic]: this.onBasicInstructionCard.bind(this),
    [parse.CardType.Interpretive]: this.onInterpretiveInstructionCard.bind(this),
    [parse.CardType.Clerical]: this.onClericalCard.bind(this),
    [parse.CardType.Address]: this.onAddressConstantCard.bind(this),
    [parse.CardType.Numeric]: this.onNumericConstantCard.bind(this)
  }

  private readonly clericalDispatch = {
    '=ECADR': this.onEqualsEcadr.bind(this),
    '=MINUS': this.onEqualsLike.bind(this),
    '=PLUS': this.onEqualsLike.bind(this),
    BNKSUM: this.onBnkSum.bind(this),
    'CHECK=': this.onCheckEquals.bind(this),
    COUNT: this.onCount.bind(this),
    'EBANK=': this.onEBankEquals.bind(this),
    EQUALS: this.onEqualsLike.bind(this),
    'SBANK=': this.onSBankEquals.bind(this)
  }

  private readonly addressDispatch = {
    '2CADR': this.on2Cadr.bind(this),
    '2FCADR': this.on2FCadr.bind(this),
    ADRES: this.onAdres.bind(this),
    BBCON: this.onBbcon.bind(this),
    CADR: this.onCadr.bind(this),
    ECADR: this.onECadr.bind(this),
    GENADR: this.onGenAdr.bind(this),
    P: this.onP.bind(this),
    REMADR: this.onRemAdr.bind(this),
    DNCHAN: this.onDnchan.bind(this),
    DNPTR: this.onDnptr.bind(this),
    '1DNADR': this.onDnadr.bind(this, 1),
    '2DNADR': this.onDnadr.bind(this, 2),
    '3DNADR': this.onDnadr.bind(this, 3),
    '4DNADR': this.onDnadr.bind(this, 4),
    '5DNADR': this.onDnadr.bind(this, 5),
    '6DNADR': this.onDnadr.bind(this, 6)
  }

  private output: Pass2Output
  private locationCounter: number
  private bnkSums: BnkSum[]
  private indexMode: boolean
  private eBank: number
  private oneShotEBank: number | undefined
  private sBank: number
  private oneShotSBank: number | undefined
  private count: AssembledCard | undefined

  constructor (
    private readonly operations: ops.Operations, private readonly memory: Memory, private readonly options: Options) {
  }

  /**
   * Runs this assembler on the specified pass 1 output.
   *
   * @param pass1 the pass 1 output
   * @returns the pass 2 output
   */
  assemble (pass1: Pass1Output): Pass2Output {
    this.output = {
      cards: pass1.cards,
      symbolTable: pass1.symbolTable,
      cells: pass1.cells,
      fatalCussCount: 0,
      nonFatalCussCount: 0
    }

    this.bnkSums = []
    this.eBank = 0
    this.sBank = 0

    let prevSource: string

    this.output.cards.forEach((card) => {
      if (card.lexedLine.sourceLine.source !== prevSource) {
        if (this.options.version.isYulNonBlk2()) {
          this.eBank = 0
        }
        prevSource = card.lexedLine.sourceLine.source
      }
      if (card.card !== undefined && card.refAddress !== undefined) {
        this.locationCounter = card.refAddress
        this.cardDispatch[card.card.type](card.card, card)
        card.eBank = this.eBank
        if (card.sBank === 0) {
          card.sBank = this.sBank
        } else {
          this.sBank = card.sBank
        }
      } else {
        card.eBank = this.eBank
        card.sBank = this.sBank
      }

      this.addCussCounts(card.cusses)
    })

    if (this.options.version.version() === versions.Enum.B1966) {
      this.addToBnkSums()
    }
    this.addBnkSums()
    return this.output
  }

  private addCussCounts (cardCusses?: cusses.Cusses): void {
    if (cardCusses !== undefined) {
      cardCusses.cusses().forEach(instance => {
        if (instance.cuss.fatal) {
          ++this.output.fatalCussCount
        } else {
          ++this.output.nonFatalCussCount
        }
      })
    }
  }

  private setCell (word: number, offset: number, complement: boolean, assembled: AssembledCard): void {
    word += offset
    if (word < 0) {
      complement = true
      word = -word
    }
    const value = complement ? word ^ COMPLEMENT_MASK : word
    this.output.cells.assignValue(this.locationCounter, value, assembled)
    ++this.locationCounter
    if (this.count !== undefined) {
      ++this.count.count
    }
  }

  private resolve (address: field.AddressField | undefined, assembled: AssembledCard): field.TrueAddress | undefined {
    return field.resolve(address, this.locationCounter, assembled, this.output.symbolTable)
  }

  private validateReachableAddress (
    trueAddress: number, reachable: boolean, assembled: AssembledCard):
    { bank?: Bank, address: number } | undefined {
    const bankAndAddress = this.memory.asSwitchedBankAndAddress(trueAddress)
    if (bankAndAddress === undefined) {
      getCusses(assembled).add(cusses.Cuss34, this.memory.asAssemblyString(trueAddress))
      return undefined
    }

    if (bankAndAddress.bank === undefined) {
      // In unswitched memory
      return bankAndAddress
    }

    // Address bank needs to match location counter fixed bank or current erasable bank.
    // No EBANK= or SBANK= statements in SuperJob though.
    if (!this.options.version.isRaytheon()) {
      if (bankAndAddress.bank.eBank !== undefined) {
        if (check(bankAndAddress.bank.eBank !== this.eBank)) {
          getCusses(assembled).add(
            cusses.Cuss3A, 'Address=' + this.memory.asAssemblyString(trueAddress), 'EBANK=' + this.eBank.toString())
        }
      } else {
        const locationAddress = this.memory.asSwitchedBankAndAddress(this.locationCounter)
        if (locationAddress?.bank !== undefined
          && check(locationAddress.bank.fBank !== bankAndAddress.bank.fBank
            || locationAddress.bank.sBank !== bankAndAddress.bank.sBank)) {
          getCusses(assembled).add(
            cusses.Cuss3A,
            'Bank mismatch',
            'Address=' + this.memory.asAssemblyString(trueAddress),
            'Location=' + this.memory.asAssemblyString(this.locationCounter))
        }
      }
    }

    return bankAndAddress

    function check (value: boolean): boolean {
      return reachable ? value : !value
    }
  }

  private updateBanks (): void {
    if (this.oneShotEBank !== undefined) {
      this.eBank = this.oneShotEBank
      this.oneShotEBank = undefined
    }
    if (this.oneShotSBank !== undefined) {
      this.sBank = this.oneShotSBank
      this.oneShotSBank = undefined
    }
  }

  private onBasicInstructionCard (card: parse.BasicInstructionCard, assembled: AssembledCard): void {
    this.updateBanks()

    if (card.operation.operation.addressRange === BasicAddressRange.IOChannel) {
      this.onBasicIOChannelCard(card, assembled)
      return
    }

    const resolved = this.basicAddress(card, assembled)
    if (resolved === undefined) {
      return
    }

    const operation = card.operation.operation
    let word: number
    if (operation.qc === undefined) {
      word = operation.opCode << 12 | (resolved.address & 0xFFF)
    } else {
      word = operation.opCode << 12 | operation.qc << 10 | resolved.address
    }

    this.setCell(word, resolved.offset, card.operation.complemented, assembled)
    this.indexMode = this.operations.isIndex(card.operation.operation)
  }

  private basicAddress (card: parse.BasicInstructionCard, assembled: AssembledCard): field.TrueAddress | undefined {
    const operation = card.operation.operation
    if (operation.specialAddress !== undefined) {
      return { address: operation.specialAddress, offset: 0 }
    }

    const resolved = this.resolve(card.address, assembled)
    if (resolved === undefined) {
      return undefined
    }
    const address = resolved.address + (operation.addressBias ?? 0)

    if (this.options.version.isRaytheon()) {
      // SuperJob seems to treat numeric subfields, including those defined by =, as an address literal,
      // so just return it.
      if (typeof card.address?.value === 'number') {
        return { address, offset: resolved.offset }
      }
      if (typeof card.address?.value === 'string') {
        const entry = this.output.symbolTable.entry(card.address.value)
        if (entry?.definition.card !== undefined) {
          const card = entry.definition.card
          if (parse.isClerical(card) && card.operation.operation === this.operations.EQUALS) {
            return { address, offset: resolved.offset }
          }
        }
      }
    }

    // If previous instruction was INDEX, operand will be modified, presumably appropriately.
    // Skip checking and just return the banked address.
    if (this.indexMode) {
      const bankAndAddress = this.memory.asSwitchedBankAndAddress(address)
      if (bankAndAddress === undefined) {
        getCusses(assembled).add(cusses.Cuss34, this.memory.asAssemblyString(address))
        return undefined
      }

      return { address: bankAndAddress.address, offset: resolved.offset }
    }

    const bankAndAddress = this.validateReachableAddress(address, true, assembled)
    if (bankAndAddress === undefined) {
      return undefined
    }

    if (operation.addressRange === BasicAddressRange.FixedMemory) {
      const addressType = this.memory.memoryType(address)
      if (!this.memory.isFixed(addressType)) {
        getCusses(assembled).add(cusses.Cuss3A, 'Expected fixed but got ' + this.memory.asAssemblyString(address))
      }
    } else if (operation.addressRange === BasicAddressRange.ErasableMemory) {
      const addressType = this.memory.memoryType(address)
      if (!this.memory.isErasable(addressType)) {
        getCusses(assembled).add(cusses.Cuss3A, 'Expected erasable but got ' + this.memory.asAssemblyString(address))
      }
    }

    return { address: bankAndAddress.address, offset: resolved.offset }
  }

  private onBasicIOChannelCard (card: parse.BasicInstructionCard, assembled: AssembledCard): void {
    const resolved = field.resolve(card.address, 0, assembled, this.output.symbolTable)
    if (resolved === undefined) {
      return
    }

    if (resolved.address < 0 || resolved.address > 0x1FF) {
      getCusses(assembled).add(cusses.Cuss3F, 'Not in I/O range ' + resolved.address.toString(8))
      return
    }

    const opCode = card.operation.operation.opCode
    const qc = card.operation.operation.qc ?? 0
    const word = opCode << 12 | qc << 9 | resolved.address
    this.setCell(word, resolved.offset, card.operation.complemented, assembled)
  }

  private onInterpretiveInstructionCard (card: parse.InterpretiveInstructionCard, assembled: AssembledCard): void {
    this.updateBanks()
    this.indexMode = false

    if (card.lhs?.operation.subType === ops.InterpretiveType.Store) {
      this.onInterpretiveStore(card.lhs, card.rhs as field.AddressField, assembled)
    } else {
      let lowOp: number
      let highOp: number
      if (card.lhs === undefined) {
        lowOp = opCode(card.rhs as parse.OperationField<ops.Interpretive>)
        highOp = 0
      } else {
        lowOp = opCode(card.lhs)
        highOp = opCode(card.rhs as parse.OperationField<ops.Interpretive>)
      }
      const raw = highOp << 7 | lowOp
      this.setCell(raw, 0, true, assembled)
    }

    function opCode (field: parse.OperationField<ops.Interpretive> | undefined): number {
      // Verified by parser
      if (field?.operation.opCode === undefined) {
        return ERROR_WORD
      }

      let code = field.operation.opCode + 1
      if (field.indexed) {
        code += 2
      }
      return code
    }
  }

  private onInterpretiveStore (
    lhs: parse.OperationField<ops.Interpretive>, rhs: field.AddressField, assembled: AssembledCard): void {
    const resolved = this.resolve(rhs, assembled)
    if (resolved === undefined) {
      return
    }

    const address = resolved.address
    if (!this.memory.isErasable(this.memory.memoryType(address))) {
      getCusses(assembled).add(cusses.Cuss3A, 'Expected erasable but got ' + this.memory.asAssemblyString(address))
    }

    let raw: number
    // Ref BTM p2-10. BLK2 uses a 4 bit op-code and a 10 bit address.
    if (this.options.version.isBlk2()) {
      const ts = (lhs.operation.code ?? 0) << 10
      const bankAndAddress = this.memory.asSwitchedBankAndAddress(address)
      raw = ts | (bankAndAddress?.address ?? ERROR_WORD)
    } else {
      const ts = (lhs.operation.code ?? 0) << 11
      raw = ts | address
    }
    // Complemented if previous instruction was STADR
    this.setCell(raw + 1, resolved.offset, lhs.complemented, assembled)
  }

  private onAddressConstantCard (card: parse.AddressConstantCard, assembled: AssembledCard): void {
    if (card.operation.operation.words > 0) {
      this.indexMode = false
    }

    const symbol = card.operation.operation.symbol
    if (symbol in this.addressDispatch) {
      const resolved = this.resolve(card.address, assembled)
      if (resolved === undefined) {
        return
      }
      this.addressDispatch[symbol](card, resolved, assembled)
    }

    this.updateBanks()
  }

  private onGenAdr (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    const bankAndAddress = this.memory.asSwitchedBankAndAddress(resolved.address)
    if (bankAndAddress === undefined) {
      getCusses(assembled).add(cusses.Cuss34)
      return
    }

    this.setCell(bankAndAddress.address, resolved.offset, card.operation.complemented, assembled)
  }

  private onAdres (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    const bankAndAddress = this.validateReachableAddress(resolved.address, true, assembled)
    if (bankAndAddress === undefined) {
      return undefined
    }

    this.setCell(bankAndAddress.address, resolved.offset, card.operation.complemented, assembled)
  }

  private onRemAdr (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    const bankAndAddress = this.validateReachableAddress(resolved.address, false, assembled)
    if (bankAndAddress === undefined) {
      return undefined
    }

    this.setCell(bankAndAddress.address, resolved.offset, card.operation.complemented, assembled)
  }

  private onCadr (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    const fixed = this.memory.asFixedCompleteAddress(resolved.address)
    if (fixed === undefined) {
      getCusses(assembled).add(cusses.Cuss37, 'Not in fixed memory', 'Address=' + this.memory.asAssemblyString(fixed))
      return
    }

    this.setCell(fixed, resolved.offset, card.operation.complemented, assembled)
  }

  private onECadr (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    if (!this.memory.isErasable(this.memory.memoryType(resolved.address))) {
      getCusses(assembled).add(
        cusses.Cuss37, 'Not in erasable memory', 'Address=' + this.memory.asAssemblyString(resolved.address))
      return
    }

    this.setCell(resolved.address, resolved.offset, card.operation.complemented, assembled)
  }

  private on2Cadr (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    if (resolved.offset !== 0) {
      getCusses(assembled).add(cusses.Cuss39, 'Offset not allowed')
      return
    }
    const address = resolved.address
    const bankAndAddress = this.memory.asBankAndAddress(address)
    const switched = this.memory.asSwitchedBankAndAddress(address)
    if (bankAndAddress === undefined || switched === undefined) {
      getCusses(assembled).add(cusses.Cuss34)
      return
    }
    const high = switched.address

    let low: number | undefined
    if (bankAndAddress.bank.eBank !== undefined) {
      low = bankAndAddress.bank.eBank
    } else {
      let ebank = this.oneShotEBank
      // Ref SYM, VC-2, which referes to BBCON but 2CADR is just a BBCON and a GENADR.
      // A preceding one-shot EBANK= is present in all code bases after Aurora.
      if (ebank === undefined) {
        if (this.options.version.isBlk2()) {
          ebank = this.eBank
        } else {
          getCusses(assembled).add(cusses.Cuss58)
          return
        }
      }
      const fBank = bankAndAddress.bank.fBank ?? -1
      const sBank = this.oneShotSBank === undefined ? bankAndAddress.bank.sBank : this.oneShotSBank
      low = this.bbconVariableFixed(fBank, sBank, ebank)
      this.oneShotEBank = undefined
      this.oneShotSBank = undefined
    }

    this.setCell(high, 0, card.operation.complemented, assembled)
    this.setCell(low, 0, card.operation.complemented, assembled)
  }

  private on2FCadr (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    if (resolved.offset !== 0) {
      getCusses(assembled).add(cusses.Cuss39, 'Offset not allowed')
      return
    }
    const address = resolved.address
    const high = this.memory.asFixedCompleteAddress(address)
    const switched = this.memory.asSwitchedBankAndAddress(address)
    if (high === undefined || switched === undefined) {
      getCusses(assembled).add(cusses.Cuss3F, 'Not in fixed memory', 'Address=' + this.memory.asAssemblyString(address))
      return
    }

    this.setCell(high, 0, card.operation.complemented, assembled)
    this.setCell(switched.address, 0, card.operation.complemented, assembled)
  }

  private onBbcon (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    let ebank = this.oneShotEBank
    // Ref SYM, VC-2 implies a preceding one-shot EBANK= is required, and it is present in all code bases after Aurora.
    if (ebank === undefined) {
      if (this.options.version.isBlk2()) {
        ebank = this.eBank
      } else {
        getCusses(assembled).add(cusses.Cuss58)
        return
      }
    }

    // Indexed is BBCON*
    const address = card.operation.indexed ? this.locationCounter : resolved.address

    // Ref BTM, 1-53 about BBCON: "The address value must be a location in fixed memory (not fixed-fixed)..."
    // However, Comanche055 has a couple of BBCON operations with fixed-fixed locations, and 2CADR, which is supposed to
    // behave like BBCON, also references fixed-fixed locations at various points in the code.
    // So allow fixed-fixed locations.
    let bank = this.memory.fixedBankNumberToBank(address)
    if (bank === undefined) {
      const bankAndAddress = this.memory.asBankAndAddress(address)
      const sBank = this.oneShotSBank === undefined ? bankAndAddress?.bank.sBank : this.oneShotSBank
      bank = { fBank: bankAndAddress?.bank.fBank ?? 0, sBank }
    }

    const value = this.bbconVariableFixed(bank.fBank, bank.sBank, ebank)
    this.setCell(value, resolved.offset, card.operation.complemented, assembled)
    this.oneShotEBank = undefined
    this.oneShotSBank = undefined
  }

  private bbconVariableFixed (fBank: number, sBank: number | undefined, eBank: number): number {
    return (fBank << 10) | ((sBank ?? this.sBank) << 4) | eBank
  }

  private onP (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    // Ref YUL, 13-137
    if (card.interpretive !== undefined) {
      if (card.interpretive.operand.type === ops.InterpretiveOperandType.Constant) {
        const operationType = card.interpretive.operator.operation.subType
        if (operationType === ops.InterpretiveType.Logical) {
          this.onLogicalP(card, resolved, assembled)
          return
        } else if (operationType === ops.InterpretiveType.Shift) {
          this.onShiftP(card, resolved, assembled)
          return
        }
      }
      this.onOtherInterpretiveP(card, resolved, assembled)
    } else {
      const address = resolved.address
      this.setCell(address + 1, resolved.offset, false, assembled)
    }
  }

  private onLogicalP (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    const flag = resolved.address
    if (flag < 0) {
      getCusses(assembled).add(cusses.Cuss3F, 'Value must be non-negative', this.memory.asAssemblyString(flag))
      return
    }
    if (resolved.offset !== 0) {
      getCusses(assembled).add(cusses.Cuss39, 'Offset not allowed')
      return
    }
    const interpretive = card.interpretive
    // Ref SYM, VIB-50
    // Format is 000FFFFCCCCSSSS where:
    // FFFF: flagword number = floor(flag / 15)
    // CCCC: code from interpretive op
    // SSSS: switch number = flag % 15
    const flagwordNumber = Math.floor(flag / 15)
    const code = interpretive?.operator.operation.code ?? 0
    const switchNumber = flag % 15
    const word = (flagwordNumber << 8) | (code << 4) | switchNumber
    this.setCell(word, 0, false, assembled)
  }

  private onShiftP (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    const shiftAmount = resolved.address + resolved.offset
    const interpretive = card.interpretive
    // INTERPRETER.agc, P1053
    if (Math.abs(shiftAmount) > 125) {
      getCusses(assembled).add(cusses.Cuss34, 'Shift must be less than 125')
    }

    // Ref SYM, VIB-26
    // Format is PPPPCCISSSSSSS where:
    // PPPPP: 0000 for BLK2, 01000 for AGC
    // CC: code from interpretive op, which is (RD: rounded, direction)
    // I: 0 for negative shift, 1 for non-negative shift
    // SSSSSSS: amount of shift
    const prefix = this.options.version.isBlk2() ? 0 : 0x2000
    const code = interpretive?.operator.operation.code ?? 0
    const word = prefix | (code << 8) | (shiftAmount + 129)
    this.setCell(word, 0, card.address?.indexRegister === 2, assembled)
  }

  private onOtherInterpretiveP (
    card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    const address = resolved.address + resolved.offset
    const interpretive = card.interpretive
    let word: number
    let complement = false
    const isErasable = this.memory.isErasable(this.memory.memoryType(address))

    if (interpretive?.operand.type === ops.InterpretiveOperandType.Address) {
      if (isErasable) {
        word = this.translateInterpretiveErasable(interpretive.operand, address, assembled)
      } else {
        word = this.translateInterpretiveFixed(interpretive.operand, address, assembled)
      }
      if (interpretive?.operand.indexable) {
        ++word
      }
      if (card.address?.indexRegister === 2) {
        complement = true
      }
    } else {
      // Ref SYM, VB-4
      if (this.options.version.isBlk2() && isErasable) {
        const bankAndAddress = this.memory.asSwitchedBankAndAddress(address)
        word = bankAndAddress?.address ?? ERROR_WORD
      } else {
        word = address > 0x1000 ? (address - 0x1000) : address
      }
      const indexableType = interpretive?.operator.operation.subType === ops.InterpretiveType.Indexable ?? false
      const firstOperand = interpretive?.operand === interpretive?.operator.operation.operand1
      if (indexableType && firstOperand) {
        ++word
      }
    }

    this.setCell(word, 0, complement, assembled)
  }

  private translateInterpretiveErasable (
    operand: ops.InterpretiveOperand, trueAddress: number, assembled: AssembledCard): number {
    if (!operand.erasableMemory) {
      getCusses(assembled).add(cusses.Cuss37, 'Erasable not allowed')
      return ERROR_WORD
    }

    // Must be in current EBANK and >= 061 and <= 01377 Ref BTM, 2-18.
    // Also allegedly off-limits are addresses < 077 and EBANKs other than the current one.
    // However, there are plenty of stores in low memory and references to other banks without
    // an EBANK= update.

    if (this.options.version.isBlk2()) {
      const bankAndAddress = this.memory.asSwitchedBankAndAddress(trueAddress)
      return bankAndAddress?.address ?? ERROR_WORD
    }
    return trueAddress
  }

  private translateInterpretiveFixed (
    operand: ops.InterpretiveOperand, trueAddress: number, assembled: AssembledCard): number {
    if (!operand.fixedMemory) {
      getCusses(assembled).add(cusses.Cuss37, 'Fixed not allowed')
    } else if (operand.indexable) {
      const fixedAddress = this.memory.asInterpretiveFixedAddress(this.locationCounter, trueAddress)
      if (fixedAddress === undefined) {
        getCusses(assembled).add(
          cusses.Cuss3A,
          'Not in location half-memory',
          this.memory.asAssemblyString(trueAddress),
          this.memory.asAssemblyString(this.locationCounter))
      } else {
        return fixedAddress
      }
    } else {
      const fixedAddress = this.memory.asFixedCompleteAddress(trueAddress)
      if (fixedAddress === undefined) {
        getCusses(assembled).add(cusses.Cuss37, 'Not in fixed bank', this.memory.asAssemblyString(trueAddress))
      } else {
        return fixedAddress
      }
    }

    return ERROR_WORD
  }

  private onDnchan (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    if (resolved.offset !== 0) {
      getCusses(assembled).add(cusses.Cuss39, 'Offset not allowed')
      return
    }
    const channel = resolved.address
    // Ref SYM, VC-3 says "bits 5-1 give the channel number", but Luminary 210 at least overflows this with a reference
    // to channel 076.
    // Accept 16 bits until we look into it more.
    if (channel >= 0x100) {
      getCusses(assembled).add(cusses.Cuss1E, 'Max channel is 377')
      return
    }

    const word = 0x3800 | channel
    this.setCell(word, 0, card.operation.complemented, assembled)
  }

  private onDnptr (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    if (resolved.offset !== 0) {
      getCusses(assembled).add(cusses.Cuss39, 'Offset not allowed')
      return
    }
    const address = resolved.address
    const bankAndAddress = this.memory.asSwitchedBankAndAddress(address)
    if (bankAndAddress === undefined) {
      getCusses(assembled).add(cusses.Cuss34)
      return
    }
    if (this.memory.memoryType(address) !== MemoryType.Variable_Fixed) {
      getCusses(assembled).add(
        cusses.Cuss37, 'Not in variable-fixed memory', 'Address=' + this.memory.asAssemblyString(address))
      return
    }

    const word = 0x3000 | (bankAndAddress.address & 0x7FF)
    this.setCell(word, 0, card.operation.complemented, assembled)
  }

  private onDnadr (
    pairs: number, card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    if (resolved.offset !== 0) {
      getCusses(assembled).add(cusses.Cuss39, 'Offset not allowed')
      return
    }
    const address = resolved.address
    if (!this.memory.isErasable(this.memory.memoryType(address))) {
      getCusses(assembled).add(cusses.Cuss37, 'Not in erasable memory', 'Address=' + this.memory.asAssemblyString(address))
      return
    }

    const pairsCoded = (pairs - 1) << 11
    const word = pairsCoded | address
    this.setCell(word, 0, card.operation.complemented, assembled)
  }

  private onNumericConstantCard (card: parse.NumericConstantCard, assembled: AssembledCard): void {
    if (card.operation.operation.words > 0) {
      this.updateBanks()
      this.indexMode = false
    }

    switch (card.operation.operation.symbol) {
      case 'MM':
        if (card.lowWord < 0 || card.lowWord > 99) {
          getCusses(assembled).add(cusses.Cuss1E, 'Must be in range [0, 99]')
          return
        }
        this.setCell(card.lowWord, 0, false, assembled)
        break

      case 'VN': {
        if (card.lowWord < 0 || card.lowWord > 9999) {
          getCusses(assembled).add(cusses.Cuss1E, 'Must be in range [0, 9999]')
          return
        }

        const verb = Math.floor(card.lowWord / 100)
        const upper = verb << 7
        const lower = card.lowWord - (verb * 100)
        this.setCell(upper | lower, 0, false, assembled)
        break
      }

      default:
        if (card.highWord !== undefined) {
          this.setCell(card.highWord, 0, card.operation.complemented, assembled)
        }
        this.setCell(card.lowWord, 0, card.operation.complemented, assembled)
    }
  }

  private onClericalCard (card: parse.ClericalCard, assembled: AssembledCard): void {
    if (card.operation.operation.words > 0) {
      this.updateBanks()
      this.indexMode = false
    }

    const symbol = card.operation.operation.symbol
    if (symbol in this.clericalDispatch) {
      this.clericalDispatch[symbol](card, assembled)
    }
  }

  private onBnkSum (card: parse.ClericalCard, assembled: AssembledCard): void {
    if (typeof card.address?.value !== 'number') {
      getCusses(assembled).add(cusses.Cuss3F)
      return
    }

    const bank = card.address.value
    const range = this.memory.fixedBankRange(card.address.value)
    if (range === undefined) {
      getCusses(assembled).add(cusses.Cuss4E)
      return
    }

    let address = this.output.cells.findLastUsed(range)
    if (address === undefined) {
      // Do not checksum empty bank
      assembled.assemblerContext = 'NO NEED'
      assembled.refAddress = undefined
      assembled.extent = 0
      return
    } else if (address >= range.max - 1) {
      // Need to reserve the last word in the bank for the checksum itself
      assembled.assemblerContext = '0 WORDS LEFT'
      assembled.refAddress = undefined
      assembled.extent = 0
      this.bnkSums.push({ definition: assembled, bank, startAddress: range.min, sumAddress: range.max })
      if (address === range.max) {
        getCusses(assembled).add(cusses.Cuss4F, 'Last word will be overwritten with checksum')
      }
      return
    }

    ++address
    const remaining = range.max - address
    assembled.assemblerContext = remaining.toString() + ' WORDS LEFT'
    const bankAndAddress = this.memory.asSwitchedBankAndAddress(address)
    if (bankAndAddress === undefined) {
      getCusses(assembled).add(cusses.Cuss3F, 'Unexpected address out of range')
      return
    }

    // YUL/GAP output these TC instructions as constants in the octal listing, so pretend they came from a address
    // constant card.
    const tcCard: parse.AddressConstantCard = {
      type: parse.CardType.Address,
      operation: { operation: this.operations.GENADR, indexed: false, complemented: false }
    }
    const tcAssembled: AssembledCard = {
      lexedLine: assembled.lexedLine,
      card: tcCard,
      extent: 1,
      count: 0,
      eBank: assembled.eBank,
      sBank: assembled.sBank
    }

    const tcAddress = bankAndAddress.address
    if (remaining === 1) {
      assembled.refAddress = address
      assembled.extent = 1
      this.output.cells.assignDefinitionAndValue(address, tcAddress, tcAssembled)
      this.bnkSums.push({ definition: assembled, bank, startAddress: range.min, sumAddress: address + 1 })
    } else {
      assembled.refAddress = address
      assembled.extent = 2
      this.output.cells.assignDefinitionAndValue(address, tcAddress, tcAssembled)
      this.output.cells.assignDefinitionAndValue(address + 1, tcAddress + 1, tcAssembled)
      this.bnkSums.push({ definition: assembled, bank, startAddress: range.min, sumAddress: address + 2 })
    }
  }

  private addToBnkSums (): void {
    // Aurora 12 manually adds the end-of-bank TC instructions but doesn't use BNKSUM.
    // The checksums are present in the octal table, however.
    const sourceLine: SourceLine = {
      source: 'NONE',
      lineNumber: 0,
      page: 0,
      line: ''
    }
    const card: parse.ClericalCard = {
      type: parse.CardType.Clerical,
      operation: { operation: this.operations.BNKSUM, indexed: false, complemented: false }
    }
    const assembled: AssembledCard = {
      lexedLine: { type: LineType.Remark, sourceLine },
      card,
      extent: 1,
      count: 0,
      eBank: 0,
      sBank: 0
    }

    for (let bank = 0; bank < this.memory.numFixedBanks(); bank++) {
      const range = this.memory.fixedBankRange(bank)
      if (range !== undefined) {
        let address = this.output.cells.findLastUsed(range)
        if (address !== undefined) {
          const remaining = range.max - address - 1
          if (remaining < 0) {
            getCusses(assembled).add(cusses.Cuss4F, 'Last word will be overwritten with checksum')
          } else {
            ++address
          }
          this.bnkSums.push({ definition: assembled, bank, startAddress: range.min, sumAddress: address })
        }
      }
    }
  }

  private addBnkSums (): void {
    // SuperJob doesn't add the TCs or use BNKSUM and in fact writes to the end of several banks, so bnkSums in empty
    // for the Raytheon assembler option.

    // Ref SYM, IIF-6 for the checksum algorithm.
    this.bnkSums.forEach(bnkSum => {
      let sum = 0
      for (let i = bnkSum.startAddress; i < bnkSum.sumAddress; i++) {
        const value = this.output.cells.value(i) ?? 0
        if (value >= 0x4000) {
          sum -= (value ^ COMPLEMENT_MASK)
        } else {
          sum += value
        }
        if (sum >= 0x4000) {
          sum -= 0x3FFF
        } else if (sum <= -0x4000) {
          sum += 0x3FFF
        }
      }

      let checksum: number
      // "The check sum word is formed by the assembler in such a way as to give it the smaller of its two possible
      // magnitudes..."
      // Meaning the checksum has the same sign as the sum, including -0 if necessary.
      // This works most of the time, but old code (Sunburst37 (aka YUL 1966) and older) appears to always use a
      // positive bank number.
      if (sum < 0 && this.options.version.isLaterThan(versions.Enum.Y1966)) {
        checksum = -bnkSum.bank - sum
        if (checksum === 0) {
          // Special case for -0
          checksum ^= COMPLEMENT_MASK
        }
      } else {
        checksum = bnkSum.bank - sum
      }
      if (checksum < 0) {
        checksum = -checksum ^ COMPLEMENT_MASK
      }

      this.output.cells.assignDefinitionAndValue(bnkSum.sumAddress, checksum, bnkSum.definition)
    })
  }

  private onCount (card: parse.ClericalCard, assembled: AssembledCard): void {
    this.count = assembled
  }

  private onEBankEquals (card: parse.ClericalCard, assembled: AssembledCard): void {
    const resolved = this.resolve(card.address, assembled)
    if (resolved === undefined) {
      return
    }
    const address = resolved.address
    let bank: number

    if (this.memory.isErasableBank(address)) {
      bank = address
    } else {
      const bankAndAddress = this.memory.asBankAndAddress(address)
      if (bankAndAddress?.bank.eBank === undefined) {
        getCusses(assembled).add(cusses.Cuss3F)
        return
      }
      bank = bankAndAddress.bank.eBank
    }

    // If multiple EBANK= statements in a row, only the last is single-shot.
    if (this.oneShotEBank !== undefined) {
      this.eBank = this.oneShotEBank
    }

    assembled.refAddress = address
    this.oneShotEBank = bank
  }

  private onSBankEquals (card: parse.ClericalCard, assembled: AssembledCard): void {
    const resolved = this.resolve(card.address, assembled)
    if (resolved === undefined) {
      return
    }
    const address = resolved.address
    let bank: number

    if (this.memory.isFixedBank(address)) {
      bank = address
    } else {
      const bankAndAddress = this.memory.asBankAndAddress(address)
      if (bankAndAddress?.bank.sBank === undefined) {
        getCusses(assembled).add(cusses.Cuss3F)
        return
      }
      bank = bankAndAddress.bank.sBank
    }

    // If multiple SBANK= statements in a row, only the last is single-shot.
    if (this.oneShotSBank !== undefined) {
      this.sBank = this.oneShotSBank
    }

    assembled.refAddress = address
    this.oneShotSBank = bank
  }

  private onCheckEquals (card: parse.ClericalCard, assembled: AssembledCard): void {
    // Verified by parser
    if (card.location === undefined) {
      return
    }
    const location = this.output.symbolTable.resolveNoReference(card.location.symbol, assembled)
    const trueAddress = this.resolve(card.address, assembled)
    if (location === undefined || trueAddress === undefined) {
      return
    }

    const address = trueAddress.address + trueAddress.offset
    if (location !== address) {
      getCusses(assembled).add(
        cusses.Cuss35,
        'Check mismatch',
        'location = ' + this.memory.asAssemblyString(location),
        'address = ' + this.memory.asAssemblyString(address))
    }
  }

  private onEqualsEcadr (card: parse.ClericalCard, assembled: AssembledCard): void {
    const resolved = this.resolve(card.address, assembled)
    if (resolved !== undefined) {
      if (!this.memory.isErasable(this.memory.memoryType(resolved.address))) {
        getCusses(assembled).add(
          cusses.Cuss37, 'Not in erasable memory', 'Address=' + this.memory.asAssemblyString(resolved.address))
      } else {
        assembled.refAddress = resolved.address + resolved.offset
      }
    }
  }

  private onEqualsLike (card: parse.ClericalCard, assembled: AssembledCard): void {
    if (card.location !== undefined) {
      // For EQUALS, the location symbol resolves to the address field value.
      // For =MINUS and =PLUS, it resolves to a combination of the location counter and address field value.
      const resolved = this.output.symbolTable.resolveNoReference(card.location.symbol, assembled)
      if (resolved !== undefined) {
        assembled.refAddress = resolved
      }
    } else {
      // EQUALS without a location symbol does nothing but print the value of the address field in the assembly listing.
      const resolved = this.resolve(card.address, assembled)
      if (resolved !== undefined) {
        assembled.refAddress = resolved.address + resolved.offset
      }
    }
  }
}
