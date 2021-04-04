import * as field from './address-field'
import * as addressing from './addressing'
import { AssembledCard, COMPLEMENT_MASK, ERROR_WORD, getCusses } from './assembly'
import { Cells } from './cells'
import * as cusses from './cusses'
import * as ops from './operations'
import { BasicAddressRange } from './operations'
import * as parse from './parser'
import { Pass1Output } from './pass1'
import { Pass2SymbolTable } from './symbol-table'

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
 * - Tracks EBANK= and SBANK= settings, and validates against them.
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
    '=MINUS': this.onEqualsLike.bind(this),
    '=PLUS': this.onEqualsLike.bind(this),
    BNKSUM: this.onBnkSum.bind(this),
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
        this.eBank = 0
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

  private setCell (word: number, offset: number, compliment: boolean, assembled: AssembledCard): void {
    word += offset
    if (word < 0) {
      compliment = true
      word = -word
    }
    const value = compliment ? word ^ COMPLEMENT_MASK : word
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
    { bank?: addressing.Bank, address: number } | undefined {
    const bankAndAddress = addressing.asSwitchedBankAndAddress(trueAddress)
    if (bankAndAddress === undefined) {
      getCusses(assembled).add(cusses.Cuss34, addressing.asAssemblyString(trueAddress))
      return undefined
    }

    if (bankAndAddress.bank === undefined) {
      // In unswitched memory
      return bankAndAddress
    }

    // Address bank needs to match location counter fixed bank or current erasable bank
    if (bankAndAddress.bank.eBank !== undefined) {
      if (check(bankAndAddress.bank.eBank !== this.eBank)) {
        getCusses(assembled).add(
          cusses.Cuss3A, 'Address=' + addressing.asAssemblyString(trueAddress), 'EBANK=' + this.eBank.toString())
        return undefined
      }
    } else {
      const locationAddress = addressing.asSwitchedBankAndAddress(this.locationCounter)
      if (locationAddress?.bank !== undefined
        && check(locationAddress.bank.fBank !== bankAndAddress.bank.fBank
          || locationAddress.bank.sBank !== bankAndAddress.bank.sBank)) {
        getCusses(assembled).add(
          cusses.Cuss3A,
          'Bank mismatch',
          'Address=' + addressing.asAssemblyString(trueAddress),
          'Location=' + addressing.asAssemblyString(this.locationCounter))
        return undefined
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
    this.indexMode = card.operation.operation.symbol === 'INDEX'
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

    // If previous instruction was INDEX, operand will be modified, presumable appropriately.
    // Skip checking and just return the banked address.
    if (this.indexMode) {
      const bankAndAddress = addressing.asSwitchedBankAndAddress(address)
      if (bankAndAddress === undefined) {
        getCusses(assembled).add(cusses.Cuss34, addressing.asAssemblyString(address))
        return undefined
      }

      return { address: bankAndAddress.address, offset: resolved.offset }
    }

    const bankAndAddress = this.validateReachableAddress(address, true, assembled)
    if (bankAndAddress === undefined) {
      return undefined
    }

    const addressType = addressing.memoryArea(address)

    if (operation.addressRange === BasicAddressRange.FixedMemory) {
      if (!addressing.isFixed(addressType)) {
        getCusses(assembled).add(cusses.Cuss3A, 'Expected fixed but got ' + addressing.asAssemblyString(address))
        return undefined
      }
    } else if (operation.addressRange === BasicAddressRange.ErasableMemory) {
      if (!addressing.isErasable(addressType)) {
        getCusses(assembled).add(cusses.Cuss3A, 'Expected erasable but got ' + addressing.asAssemblyString(address))
        return undefined
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
    if (!addressing.isErasable(addressing.memoryArea(address))) {
      getCusses(assembled).add(cusses.Cuss3A, 'Expected erasable but got ' + addressing.asAssemblyString(address))
      return
    }

    let op = lhs.operation
    if (lhs.indexed) {
      switch (lhs.operation.symbol) {
        case 'STORE':
          op = rhs.indexRegister === 1 ? ops.STORE_INDEX_1 : ops.STORE_INDEX_2
          break

        case 'STODL':
          op = ops.STODL_INDEXED
          break

        case 'STOVL':
          op = ops.STOVL_INDEXED
          break
      }
    }
    const ts = (op.code ?? 0) << 11
    const raw = ts | address
    // Complimented if previous instruction was STADR
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
    const bankAndAddress = addressing.asSwitchedBankAndAddress(resolved.address)
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
    const fixed = addressing.asFixedCompleteAddress(resolved.address)
    if (fixed === undefined) {
      getCusses(assembled).add(cusses.Cuss37, 'Not in fixed memory', 'Address=' + addressing.asAssemblyString(fixed))
      return
    }

    this.setCell(fixed, resolved.offset, card.operation.complemented, assembled)
  }

  private onECadr (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    if (!addressing.isErasable(addressing.memoryArea(resolved.address))) {
      getCusses(assembled).add(
        cusses.Cuss37, 'Not in erasable memory', 'Address=' + addressing.asAssemblyString(resolved.address))
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
    const bankAndAddress = addressing.asBankAndAddress(address)
    const switched = addressing.asSwitchedBankAndAddress(address)
    if (bankAndAddress === undefined || switched === undefined) {
      getCusses(assembled).add(cusses.Cuss34)
      return
    }
    const high = switched.address

    let low: number | undefined
    if (bankAndAddress.bank.eBank !== undefined) {
      low = bankAndAddress.bank.eBank
    } else {
      if (this.oneShotEBank === undefined) {
        getCusses(assembled).add(cusses.Cuss58)
        return
      }
      const fBank = bankAndAddress.bank.fBank ?? -1
      const sBank = this.oneShotSBank === undefined ? bankAndAddress.bank.sBank : this.oneShotSBank
      low = this.bbconVariableFixed(fBank, sBank, this.oneShotEBank)
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
    const high = addressing.asFixedCompleteAddress(address)
    const switched = addressing.asSwitchedBankAndAddress(address)
    if (high === undefined || switched === undefined) {
      getCusses(assembled).add(cusses.Cuss3F, 'Not in fixed memory', 'Address=' + addressing.asAssemblyString(address))
      return
    }

    this.setCell(high, 0, card.operation.complemented, assembled)
    this.setCell(switched.address, 0, card.operation.complemented, assembled)
  }

  private onBbcon (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    if (this.oneShotEBank === undefined) {
      getCusses(assembled).add(cusses.Cuss58)
      return
    }

    // Indexed is BBCON*
    const address = card.operation.indexed ? this.locationCounter : resolved.address

    // Ref BTM, 1-53 about BBCON: "The address value must be a location in fixed memory (not fixed-fixed)..."
    // However, Comanche055 has a couple of BBCON operations with fixed-fixed locations, and 2CADR, which is supposed to
    // behave like BBCON, also references fixed-fixed locations at various points in the code.
    // So allow fixed-fixed locations.
    let bank = addressing.fixedBankNumberToBank(address)
    if (bank === undefined) {
      const bankAndAddress = addressing.asBankAndAddress(address)
      const sBank = this.oneShotSBank === undefined ? bankAndAddress?.bank.sBank : this.oneShotSBank
      bank = { fBank: bankAndAddress?.bank.fBank ?? 0, sBank }
    }

    const value = this.bbconVariableFixed(bank.fBank, bank.sBank, this.oneShotEBank)
    this.setCell(value, resolved.offset, card.operation.complemented, assembled)
    this.oneShotEBank = undefined
    this.oneShotSBank = undefined
  }

  private bbconVariableFixed (fBank: number, sBank: number | undefined, eBank: number): number {
    return (fBank << 10) | ((sBank ?? this.sBank) << 4) | eBank
  }

  private onP (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    // See YUL, 13-137
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
      // Check if this is an address or a constant
      const address = resolved.address
      this.setCell(address + 1, resolved.offset, false, assembled)
    }
  }

  private onLogicalP (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    const flag = resolved.address
    if (flag < 0) {
      getCusses(assembled).add(cusses.Cuss3F, 'Value must be non-negative', addressing.asAssemblyString(flag))
      return
    }
    if (resolved.offset !== 0) {
      getCusses(assembled).add(cusses.Cuss39, 'Offset not allowed')
      return
    }
    const interpretive = card.interpretive
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

    // Format is 01000CCISSSSSSS where:
    // CC: code from interpretive op, which is (RD: rounded, direction)
    // I: 0 for negative shift, 1 for non-negative shift
    // SSSSSSS: amount of shift
    const code = interpretive?.operator.operation.code ?? 0
    const word = 0x2000 | (code << 8) | (shiftAmount + 129)
    this.setCell(word, 0, card.address.indexRegister === 2, assembled)
  }

  private onOtherInterpretiveP (
    card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    const address = resolved.address + resolved.offset
    const interpretive = card.interpretive
    let word: number
    let compliment = false

    const indexable = interpretive?.operator.operation.subType === ops.InterpretiveType.Indexable ?? false
    const firstOperand = interpretive?.operand === interpretive?.operator.operation.operand1
    const indexableOperand = interpretive?.operand.index ?? false

    if (interpretive?.operand.type === ops.InterpretiveOperandType.Address) {
      // TODO: See all VIA-9 for restrictions on addresses, etc.
      const isErasable = addressing.isErasable(addressing.memoryArea(address))
      if (isErasable) {
        word = this.translateInterpretiveErasable(interpretive.operand, address, assembled)
      } else {
        word = this.translateInterpretiveFixed(interpretive.operand, address, assembled)
      }
      if (indexableOperand) {
        word += 1
      }
      if (card.address.indexRegister === 2) {
        compliment = true
      }
    } else {
      word = address > 0x1000 ? (address - 0x1000) : address
      if (indexable && firstOperand) {
        ++word
      }
    }

    this.setCell(word, 0, compliment, assembled)
  }

  private translateInterpretiveErasable (
    operand: ops.InterpretiveOperand, trueAddress: number, assembled: AssembledCard): number {
    if (!operand.erasableMemory) {
      getCusses(assembled).add(cusses.Cuss37, 'Erasable not allowed')
      return ERROR_WORD
    }

    // Must be in current EBANK and >= 61(8) and <= 1377(8) Ref BTM, 2-18.
    // Also allegedly off-limits are addresses < 077 and EBANKs other than the current one.
    // However, there are plenty of stores in low memory and references to other banks without
    // an EBANK= update.
    return trueAddress
  }

  private translateInterpretiveFixed (
    operand: ops.InterpretiveOperand, trueAddress: number, assembled: AssembledCard): number {
    if (!operand.fixedMemory) {
      getCusses(assembled).add(cusses.Cuss37, 'Fixed not allowed')
    } else if (operand.index) {
      const fixedAddress = addressing.asInterpretiveFixedAddress(this.locationCounter, trueAddress)
      if (fixedAddress === undefined) {
        getCusses(assembled).add(
          cusses.Cuss3A,
          'Not in location half-memory',
          addressing.asAssemblyString(trueAddress),
          addressing.asAssemblyString(this.locationCounter))
      } else {
        return fixedAddress
      }
    } else {
      const fixedAddress = addressing.asFixedCompleteAddress(trueAddress)
      if (fixedAddress === undefined) {
        getCusses(assembled).add(cusses.Cuss37, 'Not in fixed bank', addressing.asAssemblyString(trueAddress))
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
    if (channel >= 0x20) {
      getCusses(assembled).add(cusses.Cuss1E, 'Max channel is 37')
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
    const bankAndAddress = addressing.asSwitchedBankAndAddress(address)
    if (bankAndAddress === undefined) {
      getCusses(assembled).add(cusses.Cuss34)
      return
    }
    if (addressing.memoryArea(address) !== addressing.MemoryArea.Variable_Fixed) {
      getCusses(assembled).add(
        cusses.Cuss37, 'Not in variable-fixed memory', 'Address=' + addressing.asAssemblyString(address))
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
    if (!addressing.isErasable(addressing.memoryArea(address))) {
      getCusses(assembled).add(cusses.Cuss37, 'Not in erasable memory', 'Address=' + addressing.asAssemblyString(address))
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
    const range = addressing.fixedBankRange(card.address.value)
    if (range === undefined) {
      getCusses(assembled).add(cusses.Cuss4E)
      return
    }

    const address = this.output.cells.findFree(range)
    // Need to reserve the last word in the bank for the checksum itself
    if (address === undefined || address === range.max) {
      assembled.assemblerContext = '0 WORDS LEFT'
      assembled.refAddress = undefined
      assembled.extent = 0
      this.bnkSums.push({ definition: assembled, bank, startAddress: range.min, sumAddress: range.max })
      return
    }

    const remaining = range.max - address
    assembled.assemblerContext = remaining.toString() + ' WORDS LEFT'
    const bankAndAddress = addressing.asSwitchedBankAndAddress(address)
    if (bankAndAddress === undefined) {
      getCusses(assembled).add(cusses.Cuss3F, 'Unexpected address out of range')
      return
    }

    const tcAssembled: AssembledCard = {
      lexedLine: assembled.lexedLine,
      extent: 1,
      count: 0,
      eBank: assembled.eBank,
      sBank: assembled.sBank
    }

    if (remaining === 1) {
      assembled.refAddress = address
      assembled.extent = 1
      this.output.cells.assignDefinitionAndValue(address, bankAndAddress.address, tcAssembled)
      this.bnkSums.push({ definition: assembled, bank, startAddress: range.min, sumAddress: address + 1 })
    } else {
      this.output.cells.assignDefinitionAndValue(address, bankAndAddress.address, tcAssembled)
      assembled.refAddress = address
      assembled.extent = 2
      this.output.cells.assignDefinitionAndValue(address + 1, bankAndAddress.address + 1, tcAssembled)
      this.bnkSums.push({ definition: assembled, bank, startAddress: range.min, sumAddress: address + 2 })
    }
  }

  private addBnkSums (): void {
    let localCusses = new cusses.Cusses()

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
      if (sum < 0) {
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
      if (!localCusses.empty()) {
        this.addCussCounts(localCusses)
        if (bnkSum.definition.cusses === undefined) {
          bnkSum.definition.cusses = localCusses
        } else {
          bnkSum.definition.cusses.addAll(localCusses)
        }
        localCusses = new cusses.Cusses()
      }
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

    if (addressing.isErasableBank(address)) {
      bank = address
    } else {
      const bankAndAddress = addressing.asBankAndAddress(address)
      if (bankAndAddress?.bank.eBank === undefined) {
        getCusses(assembled).add(cusses.Cuss3F)
        return
      }
      bank = bankAndAddress.bank.eBank
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

    if (addressing.isFixedBank(address)) {
      bank = address
    } else {
      const bankAndAddress = addressing.asBankAndAddress(address)
      if (bankAndAddress?.bank.sBank === undefined) {
        getCusses(assembled).add(cusses.Cuss3F)
        return
      }
      bank = bankAndAddress.bank.sBank
    }

    assembled.refAddress = address
    this.oneShotSBank = bank
  }

  private onEqualsLike (card: parse.ClericalCard, assembled: AssembledCard): void {
    // Required and verified by parser
    if (card.location !== undefined) {
      // For EQUALS, the location symbol resolves to the address field value.
      // For =MINUS and =PLUS, it resolves to a combination of the location counter and address field value.
      const resolved = this.output.symbolTable.resolveNoReference(card.location.symbol, assembled)
      if (resolved !== undefined) {
        assembled.refAddress = resolved
      }
    }
  }
}
