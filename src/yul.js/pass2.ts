import * as field from './address-field'
import * as addressing from './addressing'
import { AssembledCard, getCusses } from './assembly'
import { Cells } from './cells'
import * as constants from './constants'
import * as cusses from './cusses'
import * as ops from './operations'
import { BasicOperandType } from './operations'
import * as parse from './parser'
import { Pass1Output } from './pass1'
import { Pass2SymbolTable } from './symbol-table'

export interface Pass2Output {
  readonly inputCards: AssembledCard[]
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

export class Pass2Assembler {
  private readonly cardDispatch = {
    [parse.CardType.Basic]: this.onBasicInstructionCard.bind(this),
    [parse.CardType.Interpretive]: this.onInterpretiveInstructionCard.bind(this),
    [parse.CardType.Clerical]: this.onClericalCard.bind(this),
    [parse.CardType.Address]: this.onAddressConstantCard.bind(this),
    [parse.CardType.Numeric]: this.onNumericConstantCard.bind(this)
  }

  private readonly clericalDispatch = {
    BNKSUM: this.onBnkSum.bind(this),
    'EBANK=': this.onEBankEquals.bind(this),
    EQUALS: this.onEquals.bind(this),
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

  assemble (pass1: Pass1Output): Pass2Output {
    this.output = {
      inputCards: pass1.inputCards,
      symbolTable: pass1.symbolTable,
      cells: pass1.cells,
      fatalCussCount: 0,
      nonFatalCussCount: 0
    }

    this.bnkSums = []
    this.eBank = 0
    this.sBank = 0

    this.output.inputCards.forEach((card) => {
      if (card.card !== undefined && card.refAddress !== undefined) {
        this.locationCounter = card.refAddress
        this.cardDispatch[card.card.type](card.card, card)
        card.eBank = this.eBank
        if (card.sBank === 0) {
          card.sBank = this.sBank
        } else {
          this.sBank = card.sBank
        }
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
    // TODO: Range check word
    word += offset
    if (word < 0) {
      compliment = true
      word = -word
    }
    const value = compliment ? word ^ constants.COMPLIMENT_MASK : word
    this.output.cells.assignValue(this.locationCounter, value, assembled)
    ++this.locationCounter
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

  private updateEBank (): void {
    if (this.oneShotEBank !== undefined) {
      this.eBank = this.oneShotEBank
      this.oneShotEBank = undefined
    }
  }

  private onBasicInstructionCard (card: parse.BasicInstructionCard, assembled: AssembledCard): void {
    this.updateEBank()

    if (card.operation.operation.operandType === BasicOperandType.IOChannel) {
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

    this.setCell(word, resolved.offset, card.operation.complimented, assembled)
    this.indexMode = card.operation.operation.symbol === 'INDEX'
  }

  // See Ref 2, 13-126 on how to interpret the address field for Basic Machine Instructions.
  // It says a numeric and signed numeric subfield are added together to obtain the address.
  // But Ref 3, III-3 appears to contradict this.
  // It claims the signed numeric subfield in all cases has the effect of generating the instruction with the numeric or
  // symbol subfield as an address, and then applying the signed numeric subfield to the entire instruction word.
  // But that doesn't work for a number of cases with symbolic subfields - see "TC 1.2SPOT -12006" for example.
  // The result of that should be octal 10, but that can only be achieved by doing the subtraction first and then
  // generating the Basic word.
  // However, it is required for cases involving a numeric subfield.
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

    const addressType = addressing.addressType(address)

    if (operation.operandType === BasicOperandType.FixedMemory) {
      if (!addressing.isFixed(addressType)) {
        getCusses(assembled).add(cusses.Cuss3A, 'Expected fixed but got ' + addressing.asAssemblyString(address))
        return undefined
      }
    } else if (operation.operandType === BasicOperandType.ErasableMemory) {
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
    this.setCell(word, resolved.offset, card.operation.complimented, assembled)
  }

  private onInterpretiveInstructionCard (card: parse.InterpretiveInstructionCard, assembled: AssembledCard): void {
    this.updateEBank()
    this.indexMode = false

    if (card.lhs?.operation.subType === ops.InterpretiveType.Store) {
      this.onInterpretiveStore(card.lhs, card.rhs as parse.AddressField, assembled)
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
        return constants.ERROR_WORD
      }

      let code = field.operation.opCode + 1
      if (field.indexed) {
        code += 2
      }
      return code
    }
  }

  private onInterpretiveStore (
    lhs: parse.OperationField<ops.Interpretive>, rhs: parse.AddressField, assembled: AssembledCard): void {
    const resolved = this.resolve(rhs, assembled)
    if (resolved === undefined) {
      return
    }

    const address = resolved.address
    if (!addressing.isErasable(addressing.addressType(address))) {
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
    this.setCell(raw + 1, resolved.offset, lhs.complimented, assembled)
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

    this.updateEBank()
  }

  private onGenAdr (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    const bankAndAddress = addressing.asSwitchedBankNumberAndAddress(resolved.address)
    if (bankAndAddress === undefined) {
      getCusses(assembled).add(cusses.Cuss34)
      return
    }

    this.setCell(bankAndAddress.address, resolved.offset, card.operation.complimented, assembled)
  }

  private onAdres (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    const bankAndAddress = this.validateReachableAddress(resolved.address, true, assembled)
    if (bankAndAddress === undefined) {
      return undefined
    }

    this.setCell(bankAndAddress.address, resolved.offset, card.operation.complimented, assembled)
  }

  private onRemAdr (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    const bankAndAddress = this.validateReachableAddress(resolved.address, false, assembled)
    if (bankAndAddress === undefined) {
      return undefined
    }

    this.setCell(bankAndAddress.address, resolved.offset, card.operation.complimented, assembled)
  }

  private onCadr (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    const fixed = addressing.asFixedAddress(resolved.address)
    if (fixed === undefined) {
      getCusses(assembled).add(cusses.Cuss37, 'Not in fixed memory', 'Address=' + addressing.asAssemblyString(fixed))
      return
    }

    this.setCell(fixed, resolved.offset, card.operation.complimented, assembled)
  }

  private onECadr (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    if (!addressing.isErasable(addressing.addressType(resolved.address))) {
      getCusses(assembled).add(
        cusses.Cuss37, 'Not in erasable memory', 'Address=' + addressing.asAssemblyString(resolved.address))
      return
    }

    this.setCell(resolved.address, resolved.offset, card.operation.complimented, assembled)
  }

  private on2Cadr (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    if (resolved.offset !== 0) {
      getCusses(assembled).add(cusses.Cuss39, 'Offset not allowed')
      return
    }
    const address = resolved.address
    const bankAndAddress = addressing.asBankAndAddress(address)
    const switched = addressing.asSwitchedBankNumberAndAddress(address)
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
      // Ref 1, 1-53: This is supposed to behave like BBCON, but BBCON does not allow fixed-fixed and this needs to.
      const fBank = bankAndAddress.bank.fBank ?? -1
      low = this.bbconVariableFixed(fBank, bankAndAddress.bank.sBank ?? this.sBank, this.oneShotEBank)
      this.oneShotEBank = undefined
    }

    this.setCell(high, 0, card.operation.complimented, assembled)
    this.setCell(low, 0, card.operation.complimented, assembled)
  }

  private on2FCadr (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    if (resolved.offset !== 0) {
      getCusses(assembled).add(cusses.Cuss39, 'Offset not allowed')
      return
    }
    const address = resolved.address
    const high = addressing.asFixedAddress(address)
    const switched = addressing.asSwitchedBankNumberAndAddress(address)
    if (high === undefined || switched === undefined) {
      getCusses(assembled).add(cusses.Cuss3F, 'Not in fixed memory', 'Address=' + addressing.asAssemblyString(address))
      return
    }

    this.setCell(high, 0, card.operation.complimented, assembled)
    this.setCell(switched.address, 0, card.operation.complimented, assembled)
  }

  private onBbcon (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    if (this.oneShotEBank === undefined) {
      getCusses(assembled).add(cusses.Cuss58)
      return
    }

    // Indexed is BBCON*
    const address = card.operation.indexed ? this.locationCounter : resolved.address
    let bank = addressing.fixedBankNumberToBank(address)
    if (bank === undefined) {
      if (addressing.addressType(address) !== addressing.AddressType.Variable_Fixed) {
        getCusses(assembled).add(cusses.Cuss3F)
        return
      }

      const bankAndAddress = addressing.asBankAndAddress(address)
      bank = { fBank: bankAndAddress?.bank.fBank ?? 0, sBank: bankAndAddress?.bank.sBank }
    }

    const value = this.bbconVariableFixed(bank.fBank, bank.sBank, this.oneShotEBank)
    this.setCell(value, resolved.offset, card.operation.complimented, assembled)
    this.oneShotEBank = undefined
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

    // TODO: Only add 1 if operator is indexable? SETPD is in the indexable set, but takes a constant and can't
    // actually be indexed. It needs this incremented, but I think other non-indexable Constant ones do not.
    // For example, SSP takes a second word constant that should not be incremented.
    // * However, what about indexable operators that are not an indeable type? Do they get incremented?
    // TODO: See Ref 3, VIA-8. Is this only for actually indexed operators, or indexable?
    // Add 1 for first indexable IAW
    const indexable = interpretive?.operator.operation.subType === ops.InterpretiveType.Indexable ?? false
    const firstOperand = interpretive?.operand === interpretive?.operator.operation.operand1
    const indexableOperand = interpretive?.operand.index ?? false

    if (interpretive?.operand.type === ops.InterpretiveOperandType.Address) {
      // TODO: See all VIA-9 for restrictions on addresses, etc.
      const isErasable = addressing.isErasable(addressing.addressType(address))
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
      getCusses(assembled).add(cusses.Cuss37, 'Eraseable not allowed')
      return constants.ERROR_WORD
    }

    // Must be in current EBANK and >= 61(8) and <= 1377(8) Ref 1, 2-18 (see above also)
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
      const fixedAddress = addressing.asFixedAddress(trueAddress)
      if (fixedAddress === undefined) {
        getCusses(assembled).add(cusses.Cuss37, 'Not in fixed bank', addressing.asAssemblyString(trueAddress))
      } else {
        return fixedAddress
      }
    }

    return constants.ERROR_WORD
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
    this.setCell(word, 0, card.operation.complimented, assembled)
  }

  private onDnptr (card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    if (resolved.offset !== 0) {
      getCusses(assembled).add(cusses.Cuss39, 'Offset not allowed')
      return
    }
    const address = resolved.address
    const bankAndAddress = addressing.asSwitchedBankNumberAndAddress(address)
    if (bankAndAddress === undefined) {
      getCusses(assembled).add(cusses.Cuss34)
      return
    }
    if (addressing.addressType(address) !== addressing.AddressType.Variable_Fixed) {
      getCusses(assembled).add(
        cusses.Cuss37, 'Not in variable-fixed memory', 'Address=' + addressing.asAssemblyString(address))
      return
    }

    const word = 0x3000 | (bankAndAddress.address & 0x7FF)
    this.setCell(word, 0, card.operation.complimented, assembled)
  }

  private onDnadr (
    pairs: number, card: parse.AddressConstantCard, resolved: field.TrueAddress, assembled: AssembledCard): void {
    if (resolved.offset !== 0) {
      getCusses(assembled).add(cusses.Cuss39, 'Offset not allowed')
      return
    }
    const address = resolved.address
    if (!addressing.isErasable(addressing.addressType(address))) {
      getCusses(assembled).add(cusses.Cuss37, 'Not in erasable memory', 'Address=' + addressing.asAssemblyString(address))
      return
    }

    const pairsCoded = (pairs - 1) << 11
    const word = pairsCoded | address
    this.setCell(word, 0, card.operation.complimented, assembled)
  }

  private onNumericConstantCard (card: parse.NumericConstantCard, assembled: AssembledCard): void {
    if (card.operation.operation.words > 0) {
      this.updateEBank()
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
          this.setCell(card.highWord, 0, card.operation.complimented, assembled)
        }
        this.setCell(card.lowWord, 0, card.operation.complimented, assembled)
    }
  }

  private onClericalCard (card: parse.ClericalCard, assembled: AssembledCard): void {
    if (card.operation.operation.words > 0) {
      this.updateEBank()
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
    if (address === undefined) {
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

    if (remaining === 1) {
      assembled.refAddress = address
      assembled.extent = 1
      this.output.cells.assignDefinitionAndValue(address, assembled, bankAndAddress.address)
      this.bnkSums.push({ definition: assembled, bank, startAddress: range.min, sumAddress: address + 1 })
    } else {
      this.output.cells.assignDefinitionAndValue(address, assembled, bankAndAddress.address)
      assembled.refAddress = address
      assembled.extent = 2
      this.output.cells.assignDefinitionAndValue(address + 1, assembled, bankAndAddress.address + 1)
      this.bnkSums.push({ definition: assembled, bank, startAddress: range.min, sumAddress: address + 2 })
    }
  }

  private addBnkSums (): void {
    let localCusses = new cusses.Cusses()

    this.bnkSums.forEach(bnkSum => {
      let sum = 0
      for (let i = bnkSum.startAddress; i < bnkSum.sumAddress; i++) {
        const value = this.output.cells.value(i) ?? 0
        if (value >= 0x4000) {
          sum -= (value ^ constants.COMPLIMENT_MASK)
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
      if (sum < 0) {
        checksum = -bnkSum.bank - sum
        if (checksum === 0) {
          // Sum less than zero results in checksum of -0 if necessary
          checksum ^= constants.COMPLIMENT_MASK
        }
      } else {
        checksum = bnkSum.bank - sum
      }
      if (checksum < 0) {
        checksum = -checksum ^ constants.COMPLIMENT_MASK
      }

      this.output.cells.assignDefinitionAndValue(bnkSum.sumAddress, bnkSum.definition, checksum)
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
    const bankAndAddress = addressing.asBankAndAddress(address)
    assembled.refAddress = address
    this.sBank = bankAndAddress?.bank.sBank ?? 0
  }

  private onEquals (card: parse.ClericalCard, assembled: AssembledCard): void {
    if (assembled.refAddress === undefined) {
      const resolved = this.resolve(card.address, assembled)
      if (resolved !== undefined) {
        assembled.refAddress = resolved.address + resolved.offset
      }
    }
  }
}
