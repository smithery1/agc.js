import { isBlk2, isGap, Options } from './bootstrap'

/**
 * Information about an address range; min and max are inclusive true addresses.
 */
export interface Range {
  min: number
  max: number
}

/**
 * Information about the banks of a true address.
 */
export interface Bank {
  eBank?: number
  fBank?: number
  sBank?: number
}

/**
 * The various types of memory areas.
 * The nomenclature varies between documents and the choices here arbitrarily follow Ref SYM, IIB-3.
 */
export enum MemoryType {
  Hardware,
  Special_Erasable,
  Unswitched_Banked_Erasable,
  Switched_Erasable,
  Fixed_Fixed,
  Variable_Fixed,
  Nonexistent
}

export interface MemoryRange extends Range {
  type: MemoryType
}

const TRUE_ADDRESS_RANGES: MemoryRange[] = [
  // Hardware, cannot reserve
  { min: 0x0000, max: 0x0007, type: MemoryType.Hardware },
  // Special erasable, cannot reserve
  { min: 0x0008, max: 0x0030, type: MemoryType.Special_Erasable },
  // Erasable bank 0, unswitched
  { min: 0x0031, max: 0x00FF, type: MemoryType.Unswitched_Banked_Erasable },
  // Erasable banks 1-2, unswitched
  { min: 0x0100, max: 0x01FF, type: MemoryType.Unswitched_Banked_Erasable },
  { min: 0x0200, max: 0x02FF, type: MemoryType.Unswitched_Banked_Erasable },
  // Erasable banks 3-7, switched
  { min: 0x0300, max: 0x03FF, type: MemoryType.Switched_Erasable },
  { min: 0x0400, max: 0x04FF, type: MemoryType.Switched_Erasable },
  { min: 0x0500, max: 0x05FF, type: MemoryType.Switched_Erasable },
  { min: 0x0600, max: 0x06FF, type: MemoryType.Switched_Erasable },
  { min: 0x0700, max: 0x07FF, type: MemoryType.Switched_Erasable },
  // Fixed banks 02-03, fixed-fixed
  { min: 0x800, max: 0xBFF, type: MemoryType.Fixed_Fixed },
  { min: 0xC00, max: 0xFFF, type: MemoryType.Fixed_Fixed },
  // Fixed banks 00-01, variable-fixed
  { min: 0x1000, max: 0x13FF, type: MemoryType.Variable_Fixed },
  { min: 0x1400, max: 0x17FF, type: MemoryType.Variable_Fixed },
  // Nonexistent
  { min: 0x1800, max: 0x1FFF, type: MemoryType.Nonexistent },
  // Fixed banks 04-27, variable-fixed
  { min: 0x2000, max: 0x23FF, type: MemoryType.Variable_Fixed },
  { min: 0x2400, max: 0x27FF, type: MemoryType.Variable_Fixed },
  { min: 0x2800, max: 0x2BFF, type: MemoryType.Variable_Fixed },
  { min: 0x2C00, max: 0x2FFF, type: MemoryType.Variable_Fixed },
  { min: 0x3000, max: 0x33FF, type: MemoryType.Variable_Fixed },
  { min: 0x3400, max: 0x37FF, type: MemoryType.Variable_Fixed },
  { min: 0x3800, max: 0x3BFF, type: MemoryType.Variable_Fixed },
  { min: 0x3C00, max: 0x3FFF, type: MemoryType.Variable_Fixed },
  { min: 0x4000, max: 0x43FF, type: MemoryType.Variable_Fixed },
  { min: 0x4400, max: 0x47FF, type: MemoryType.Variable_Fixed },
  { min: 0x4800, max: 0x4BFF, type: MemoryType.Variable_Fixed },
  { min: 0x4C00, max: 0x4FFF, type: MemoryType.Variable_Fixed },
  { min: 0x5000, max: 0x53FF, type: MemoryType.Variable_Fixed },
  { min: 0x5400, max: 0x57FF, type: MemoryType.Variable_Fixed },
  { min: 0x5800, max: 0x5BFF, type: MemoryType.Variable_Fixed },
  { min: 0x5C00, max: 0x5FFF, type: MemoryType.Variable_Fixed },
  { min: 0x6000, max: 0x63FF, type: MemoryType.Variable_Fixed },
  { min: 0x6400, max: 0x67FF, type: MemoryType.Variable_Fixed },
  { min: 0x6800, max: 0x6BFF, type: MemoryType.Variable_Fixed },
  { min: 0x6C00, max: 0x6FFF, type: MemoryType.Variable_Fixed },
  // Fixed banks 30-37, Superbank S3
  { min: 0x7000, max: 0x73FF, type: MemoryType.Variable_Fixed },
  { min: 0x7400, max: 0x77FF, type: MemoryType.Variable_Fixed },
  { min: 0x7800, max: 0x7BFF, type: MemoryType.Variable_Fixed },
  { min: 0x7C00, max: 0x7FFF, type: MemoryType.Variable_Fixed },
  { min: 0x8000, max: 0x83FF, type: MemoryType.Variable_Fixed },
  { min: 0x8400, max: 0x87FF, type: MemoryType.Variable_Fixed },
  { min: 0x8800, max: 0x8BFF, type: MemoryType.Variable_Fixed },
  { min: 0x8C00, max: 0x8FFF, type: MemoryType.Variable_Fixed },
  // Fixed banks 40-43, Superbank S4
  { min: 0x9000, max: 0x93FF, type: MemoryType.Variable_Fixed },
  { min: 0x9400, max: 0x97FF, type: MemoryType.Variable_Fixed },
  { min: 0x9800, max: 0x9BFF, type: MemoryType.Variable_Fixed },
  { min: 0x9C00, max: 0x9FFF, type: MemoryType.Variable_Fixed },
  // Nonexistent
  { min: 0xA000, max: 0xCFFF, type: MemoryType.Nonexistent },
  // Fixed banks 60-67, Superbank S5?
  { min: 0xD000, max: 0xD3FF, type: MemoryType.Variable_Fixed },
  { min: 0xD400, max: 0xD7FF, type: MemoryType.Variable_Fixed },
  { min: 0xD800, max: 0xDBFF, type: MemoryType.Variable_Fixed },
  { min: 0xDC00, max: 0xDFFF, type: MemoryType.Variable_Fixed },
  { min: 0xE000, max: 0xE3FF, type: MemoryType.Variable_Fixed },
  { min: 0xE400, max: 0xE7FF, type: MemoryType.Variable_Fixed },
  { min: 0xE800, max: 0xEBFF, type: MemoryType.Variable_Fixed },
  { min: 0xEC00, max: 0xEFFF, type: MemoryType.Variable_Fixed }
]

const FIXED_BANKS_START_INDEX = 10
const NONEXISTENT_BANK_02_INDEX = 14
const FIXED_BANK_04_INDEX = 15
const S3_START_INDEX = 35

export function createMemory (options: Options): Memory {
  let banks: number
  let nonexistentHighMem: Range | undefined

  if (isGap(options.yulVersion)) {
    banks = 43
    nonexistentHighMem = { min: 0xF000, max: 0xFFFF }
  } else if (isBlk2(options.yulVersion)) {
    banks = 23
  } else {
    banks = 35
    nonexistentHighMem = { min: 0xA000, max: 0xEFFF }
  }
  return new Memory(banks, nonexistentHighMem)
}

export class Memory {
  private readonly ranges: MemoryRange[]
  private readonly fixedBanks: MemoryRange[]
  private readonly nonExistent: MemoryRange[]
  private readonly highMemory: number

  /**
   * Constructs a memory representation with the specified number of banks.
   * GAP output on MEMORY TYPE & AVAILABILITY DISPLAY page shows banks above 043
   * that are never used.
   *
   * @param fixedBanks the number of fixed banks typically 027, 037, 043, or 053
   * @throws if fixedBanks is not in the range [027, 043]
   */
  constructor (fixedBanks: number, nonexistentHighMem: Range | undefined) {
    if (fixedBanks < 23 || fixedBanks > 43) {
      throw new Error('fixedBanks out of range')
    }

    this.ranges = []
    this.fixedBanks = []
    this.nonExistent = []

    for (let i = 0; i < FIXED_BANK_04_INDEX; i++) {
      this.ranges.push(TRUE_ADDRESS_RANGES[i])
    }

    this.fixedBanks.push(TRUE_ADDRESS_RANGES[FIXED_BANKS_START_INDEX + 2])
    this.fixedBanks.push(TRUE_ADDRESS_RANGES[FIXED_BANKS_START_INDEX + 3])
    this.fixedBanks.push(TRUE_ADDRESS_RANGES[FIXED_BANKS_START_INDEX + 0])
    this.fixedBanks.push(TRUE_ADDRESS_RANGES[FIXED_BANKS_START_INDEX + 1])
    this.nonExistent.push(TRUE_ADDRESS_RANGES[NONEXISTENT_BANK_02_INDEX])

    let i = 0
    let fixedBanksRemaining = fixedBanks - 3
    while (fixedBanksRemaining > 0) {
      const range = TRUE_ADDRESS_RANGES[FIXED_BANK_04_INDEX + i++]
      this.ranges.push(range)
      if (range.type === MemoryType.Nonexistent) {
        this.nonExistent.push(range)
      } else {
        this.fixedBanks.push(range)
        --fixedBanksRemaining
      }
    }

    if (nonexistentHighMem !== undefined) {
      // Add the nonexistent high memory
      const range = { min: nonexistentHighMem?.min, max: nonexistentHighMem?.max, type: MemoryType.Nonexistent }
      this.ranges.push(range)
      this.nonExistent.push(range)
    }

    this.highMemory = this.ranges[this.ranges.length - 1].max
  }

  /**
   * Returns the memory area ranges for this memory.
   *
   * @returns the ranges
   */
  memoryRanges (): MemoryRange[] {
    return this.ranges
  }

  /**
   * Returns the memory type for the specified true address.
   *
   * @param trueAddress the address to examine
   * @returns the memory type for the specified true address
   */
  memoryType (trueAddress: number): MemoryType {
    if (trueAddress < 0) {
      return MemoryType.Nonexistent
    }
    const type = this.ranges.find(range => trueAddress <= range.max)
    return type === undefined ? MemoryType.Nonexistent : type.type
  }

  /**
   * Returns true iff the specified type is in the erasable range.
   *
   * @param type the type to examine
   * @returns true iff the specified type is in the erasable range
   */
  isErasable (type: MemoryType): boolean {
    switch (type) {
      case MemoryType.Hardware:
      case MemoryType.Special_Erasable:
      case MemoryType.Unswitched_Banked_Erasable:
      case MemoryType.Switched_Erasable:
        return true
    }
    return false
  }

  /**
   * Returns true iff the specified type is in the fixed range.
   *
   * @param type the type to examine
   * @returns true iff the specified type is in the fixed range
   */
  isFixed (type: MemoryType): boolean {
    return type === MemoryType.Fixed_Fixed
      || type === MemoryType.Variable_Fixed
  }

  /**
   * Returns the number of fixed banks in this memory.
   *
   * @returns the number of fixed banks in this memory
   */
  numFixedBanks (): number {
    return this.fixedBanks.length
  }

  /**
   * Returns the true address range for the specified fixed bank number.
   * If the bank number is outside the range for this memory, undefined is returned.
   *
   * @param bank the fixed bank number
   * @returns the true address range for the specified fixed bank number
   */
  fixedBankRange (bank: number): Range | undefined {
    return this.fixedBanks[bank]
  }

  /**
   * Returns the number of the fixed bank that contains the specified true address.
   * If the address is outside the fixed memory range for this memory, undefined is returned.
   *
   * @param trueAddress the address to examine
   * @returns the number of the fixed bank that contains the specified true address
   */
  fixedBankNumber (trueAddress: number): number | undefined {
    const result = this.asBankAndAddress(trueAddress)
    if (result?.bank.fBank === undefined) {
      return undefined
    }

    return result.bank.sBank === 4 ? result.bank.fBank + 8 : result.bank.fBank
  }

  /**
   * Returns true iff the specified bank number corresponds to an erasable bank, i.e. is in the range [0, 7].
   *
   * @param bank the bank number to examine
   * @returns true iff the specified bank number corresponds to an erasable bank
   */
  isErasableBank (bank: number): boolean {
    return bank >= 0 && bank <= 7
  }

  /**
   * Returns true iff the specified bank number corresponds to a fixed bank for this memory.
   *
   * @param bank the bank number to examine
   * @returns true iff the specified bank number corresponds to a fixed bank
   */
  isFixedBank (bank: number): boolean {
    return bank >= 0 && bank <= this.numFixedBanks()
  }

  /**
   * Returns the FBANK number and SBANK number if applicable for the specified fixed bank number.
   * If the bank number is outside this memory range, undefined is returned.
   *
   * @param bank the bank number to examine
   * @returns the FBANK number and SBANK number if applicable for the specified fixed bank number
   */
  fixedBankNumberToBank (bank: number): { fBank: number, sBank?: number } | undefined {
    if (!this.isFixedBank(bank)) {
      return undefined
    }

    if (bank < 24) {
      return { fBank: bank }
    } else if (bank < 32) {
      return { fBank: bank, sBank: 3 }
    } else {
      return { fBank: bank, sBank: 4 }
    }
  }

  private asErasableBankAndAddress (trueAddress: number): { bank: Bank, address: number } {
    const address = 0x300 + (trueAddress & 0xFF)
    const eBank = (trueAddress & 0x700) >> 8
    return { bank: { eBank }, address }
  }

  private asFixedBankAndAddress (trueAddress: number): { bank: Bank, address: number } {
    const fixed = trueAddress >= 0x1000 ? trueAddress - 0x1000 : trueAddress
    const address = 0x400 + (fixed & 0x3FF)
    let allSBank = ((fixed & 0xE000) >> 13)
    if (allSBank < 3) {
      allSBank = 3
    }
    const fBank = allSBank <= 3 ? (fixed & 0x7C00) >> 10 : 0x18 + ((fixed & 0x1C00) >> 10)
    const sBank = trueAddress < TRUE_ADDRESS_RANGES[S3_START_INDEX].min ? undefined : allSBank
    return { bank: { fBank, sBank }, address }
  }

  /**
   * Returns the bank information and S-register address for the specified true address.
   * If the address is outside the machine's memory range, undefined is returned.
   *
   * @param trueAddress the address to translate
   * @returns the bank information and S-register address for the specified true address
   */
  asBankAndAddress (trueAddress: number): { bank: Bank, address: number } | undefined {
    const type = this.memoryType(trueAddress)
    if (this.isErasable(type)) {
      return this.asErasableBankAndAddress(trueAddress)
    } else if (this.isFixed(type)) {
      return this.asFixedBankAndAddress(trueAddress)
    }
  }

  /**
   * Returns the switched bank information and S-register address for the specified true address.
   * If the true address is in unswitched memory, it is returned as is with bank as undefined.
   * Otherwise equivalent to calling asBankAddress.
   *
   * @param trueAddress the address to translate
   * @returns the switched bank information and S-register address for the specified true address
   */
  asSwitchedBankAndAddress (trueAddress: number): { bank?: Bank, address: number } | undefined {
    const type = this.memoryType(trueAddress)
    if (type === MemoryType.Switched_Erasable) {
      return this.asErasableBankAndAddress(trueAddress)
    } else if (type === MemoryType.Variable_Fixed) {
      return this.asFixedBankAndAddress(trueAddress)
    } else if (type !== MemoryType.Nonexistent) {
      return { address: trueAddress }
    }
  }

  private asCompleteSwitchedBankAndAddress (trueAddress: number): { bank?: Bank, address: number } | undefined {
    const type = this.memoryType(trueAddress)
    if (type === MemoryType.Switched_Erasable) {
      return this.asErasableBankAndAddress(trueAddress)
    } else if (type === MemoryType.Variable_Fixed) {
      return this.asFixedBankAndAddress(trueAddress)
    } else if (type !== MemoryType.Nonexistent) {
      return { address: trueAddress }
    } else if (trueAddress <= this.highMemory) {
      return this.asFixedBankAndAddress(trueAddress)
    }
  }

  /**
   * Returns the fixed complete address for the specified true address.
   * This is the FBANK ([0, 037]) in the 4 high bits and the S-register offset ([0, 01777]) in the 10 low bits.
   * See Ref BTM, page 1-11.
   * If the address is outside the fixed memory range, undefined is returned.
   *
   * @param trueAddress the address to translate
   * @returns the fixed complete address for the specified true address
   */
  asFixedCompleteAddress (trueAddress: number): number | undefined {
    const bankAndAddress = this.asBankAndAddress(trueAddress)
    if (bankAndAddress === undefined || bankAndAddress.bank.fBank === undefined) {
      return undefined
    }

    return bankAndAddress.bank.fBank << 10 | (bankAndAddress.address - 0x400)
  }

  isLowMemoryInterpretive (trueAddress: number): boolean | undefined {
    if (trueAddress >= this.fixedBanks[4].min) {
      if (trueAddress <= this.fixedBanks[15].max) {
        return true
      }
      if (trueAddress >= this.fixedBanks[16].min && trueAddress <= this.highMemory) {
        return false
      }
    }
  }

  /**
   * Returns the interpretive fixed complete address, used for interpretive indexing.
   * The true address must be in the same "half-memory" as the location counter.
   * The returned value is the same as the fixed complete address for "low" half-memory, and similar for "high"
   * half-memory but with the FBANK offset by -020.
   * See Ref BTM, section 2.2.3.
   * If the address is not in the same half-memory as the location counter, undefined is returned.
   *
   * @param locationCounter the location counter of the interpretive instruction
   * @param trueAddress the true address referenced by the IAW
   * @returns the interpretive fixed complete address
   */
  asInterpretiveFixedAddress (locationCounter: number, trueAddress: number): number | undefined {
    const locationLow = this.isLowMemoryInterpretive(locationCounter)
    const addressLow = this.isLowMemoryInterpretive(trueAddress)
    if (addressLow === undefined || addressLow !== locationLow) {
      return undefined
    }

    const bankAndAddress = this.asBankAndAddress(trueAddress)
    if (bankAndAddress?.bank.fBank !== undefined) {
      if (addressLow) {
        return bankAndAddress.bank.fBank << 10 | (bankAndAddress.address - 0x400)
      } else {
        return (bankAndAddress.bank.fBank - 16) << 10 | (bankAndAddress.address - 0x400)
      }
    }
  }

  /**
   * Formats the specified true address as an assembly string to match the YUL assembly listing.
   *
   * The assembly string format is as follows.
   * SREG is the S-register value.
   * All values are in octal.
   * - If in erasable memory: "E" <EBANK> "," <SREG>
   * - If in fixed memory for this memory: <fixed bank> "," <SREG>
   * - If not addressable: <address> "?"
   *
   * @param trueAddress the address to format
   * @returns the assembly string formatted address
   */
  asAssemblyString (trueAddress?: number): string {
    if (trueAddress === undefined) {
      return ''
    }

    const bankAndAddress = this.asCompleteSwitchedBankAndAddress(trueAddress)
    let bankField = ''
    if (bankAndAddress === undefined) {
      return trueAddress.toString(8) + '?'
    } else if (bankAndAddress.bank !== undefined) {
      if (bankAndAddress.bank.eBank !== undefined) {
        bankField = 'E' + bankAndAddress.bank.eBank.toString(8) + ','
      } else if (bankAndAddress.bank.fBank !== undefined) {
        const adjustedFBank = bankAndAddress.bank.fBank + 8 * ((bankAndAddress.bank.sBank ?? 3) - 3)
        bankField = adjustedFBank.toString(8).padStart(2, '0') + ','
      }
    }

    const addressField = bankAndAddress.address.toString(8).padStart(4, '0')
    return bankField + addressField
  }

  /**
   * Returns the paragraph number for the specified fixed memory true address.
   * If the address is outside the fixed memory range, undefined is returned.
   * Ref SYM, IIF-4.
   *
   * @param trueAddress the address to examine
   * @returns the paragraph number
   */
  paragraph (trueAddress: number): number | undefined {
    return this.isFixed(this.memoryType(trueAddress)) ? Math.floor(trueAddress / 256) : undefined
  }

  /**
   * Returns the hardware module number for the specified fixed bank number.
   * Ref SYM, IIF-3.
   *
   * @param bank the fixed bank
   * @returns the module number 1-6, or undefined if bank is not a fixed bank number
   */
  hardwareModule (bank: number): number | undefined {
    if (!this.isFixedBank(bank)) {
      return undefined
    }

    return Math.floor((bank + 1) / 6) + 1
  }

  /**
   * Returns the hardware side string ('A' or 'B') for the specified S-register address.
   * Ref SYM, IIF-3.
   *
   * @param sRegister the S-register value
   * @returns the side
   */
  hardwareSide (sRegister: number): string {
    return (sRegister & 0x100) === 0 ? 'A' : 'B'
  }

  /**
   * Returns the hardware strand (1 - 12) within a module for the specified bank and S-register address.
   * Ref SYM, IIF-3.
   *
   * @param bank the fixed bank
   * @param sRegister the S-register value
   */
  hardwareStrand (bank: number, sRegister: number): number {
    return 2 * (bank % 6) + ((sRegister & 0x200) === 0 ? 0 : 1) + 1
  }

  /**
   * Returns the hardware wire range for the specified set.
   * Empirically from original assembly output.
   *
   * @param set the set
   * @returns the wire range
   */
  hardwareWires (set: number): Range {
    const min = 1 + (set - 1) * 16
    const max = min + 15
    return { min, max }
  }

  /**
   * Returns the number of usable memory words.
   * This is the memory range minus any nonexistent ranges.
   *
   * @returns the number of usable memory words
   */
  cellCount (): number {
    const unaddressable = this.nonExistent.reduce(
      (total: number, range: MemoryRange) => { return total + range.max - range.min + 1 }, 0)
    return this.highMemory - unaddressable + 1
  }

  /**
   * Returns the first fixed bank's offset from the start of memory.
   *
   * @returns the first fixed bank's offset from the start of memory
   */
  fixedMemoryOffset (): number {
    return this.memoryOffset(TRUE_ADDRESS_RANGES[FIXED_BANKS_START_INDEX].min)
  }

  /**
   * Returns the specified true address's offset from the start of memory, ignoring the nonexistent ranges.
   * No checking is done to ensure the address falls within the memory range.
   *
   * @param trueAddress the address to examine
   * @returns the specified true address's offset from the start of memory
   */
  memoryOffset (trueAddress: number): number {
    const unaddressable = this.nonExistent.reduce(
      (total: number, range: MemoryRange) => {
        if (trueAddress > range.max) {
          return total + range.max - range.min + 1
        }
        return total
      }, 0)
    return trueAddress - unaddressable
  }

  /**
   * Returns the true memory address for the specified offset from the start of memory.
   * This is the complement to memoryOffset.
   * No range checking is done on the input.
   *
   * @param offset the offset from the start of memory
   * @returns the true memory address for the specified offset from the start of memory
   */
  memoryAddress (offset: number): number {
    return this.nonExistent.reduce(
      (total: number, range: MemoryRange) => {
        if (total < range.min) {
          return total
        }
        return total + range.max - range.min + 1
      }, offset)
  }
}
