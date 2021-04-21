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
 * Hardware erasable range.
 * Cannot reserve.
 */
export const TRUE_RANGE_HARDWARE = { min: 0, max: 8 }

/**
 * Special erasable range.
 * Cannot reserve.
 */
export const TRUE_RANGE_SPECIAL = { min: 9, max: 0x2F }

/**
 * Unswitched erasable.
 * Can reserve.
 */
export const TRUE_RANGE_UNSWITCHED_ERASABLE = { min: 0x30, max: 0x2FF }

/**
 * Switched erasable.
 * Can reserve.
 */
export const TRUE_RANGE_SWITCHED_ERASABLE = { min: 0x300, max: 0x7FF }

/**
 * Unswitched fixed.
 */
export const TRUE_RANGE_FIXED_FIXED = { min: 0x800, max: 0xFFF }

/**
 * Switchable fixed range 1.
 */
export const TRUE_RANGE_VARIABLE_FIXED_1 = { min: 0x1000, max: 0x17FF }

/**
 * Gap.
 */
export const TRUE_RANGE_UNALLOCATED = { min: 0x1800, max: 0x1FFF }

/**
 * Switchable fixed range 2.
 */
export const TRUE_RANGE_VARIABLE_FIXED_2 = { min: 0x2000, max: 0x9FFF }

/**
 * Range requiring use of the superbank.
 */
export const TRUE_RANGE_SUPERBANKS = { min: 0x7000, max: 0x9FFF }

/**
 * Superbank S3
 */
export const TRUE_RANGE_SUPERBANK_S3 = { min: 0x7000, max: 0x8FFF }

/**
 * Superbank S4
 */
export const TRUE_RANGE_SUPERBANK_S4 = { min: 0x9000, max: 0x9FFF }

const TRUE_FIXED_BANKS = [
  // Banks 00-01
  { min: 0x1000, max: 0x13FF },
  { min: 0x1400, max: 0x17FF },
  // Banks 02-03 (fixed-fixed)
  { min: 0x800, max: 0xBFF },
  { min: 0xC00, max: 0xFFF },
  // Banks 04-27
  { min: 0x2000, max: 0x23FF },
  { min: 0x2400, max: 0x27FF },
  { min: 0x2800, max: 0x2BFF },
  { min: 0x2C00, max: 0x2FFF },
  { min: 0x3000, max: 0x33FF },
  { min: 0x3400, max: 0x37FF },
  { min: 0x3800, max: 0x3BFF },
  { min: 0x3C00, max: 0x3FFF },
  { min: 0x4000, max: 0x43FF },
  { min: 0x4400, max: 0x47FF },
  { min: 0x4800, max: 0x4BFF },
  { min: 0x4C00, max: 0x4FFF },
  { min: 0x5000, max: 0x53FF },
  { min: 0x5400, max: 0x57FF },
  { min: 0x5800, max: 0x5BFF },
  { min: 0x5C00, max: 0x5FFF },
  { min: 0x6000, max: 0x63FF },
  { min: 0x6400, max: 0x67FF },
  { min: 0x6800, max: 0x6BFF },
  { min: 0x6C00, max: 0x6FFF },
  // Banks 30-37 (Superbank S3)
  { min: 0x7000, max: 0x73FF },
  { min: 0x7400, max: 0x77FF },
  { min: 0x7800, max: 0x7BFF },
  { min: 0x7C00, max: 0x7FFF },
  { min: 0x8000, max: 0x83FF },
  { min: 0x8400, max: 0x87FF },
  { min: 0x8800, max: 0x8BFF },
  { min: 0x8C00, max: 0x8FFF },
  // Banks 40-43 (Superbank S4)
  { min: 0x9000, max: 0x93FF },
  { min: 0x9400, max: 0x97FF },
  { min: 0x9800, max: 0x9BFF },
  { min: 0x9C00, max: 0x9FFF }
]

/**
 * The last true address location.
 */
export const MEMORY_MAX = 0x9FFF

/**
 * The number of memory words.
 */
export const MEMORY_SIZE = MEMORY_MAX - 0x800

/**
 * The start of fixed memory.
 */
export const FIXED_MEMORY_OFFSET = TRUE_RANGE_FIXED_FIXED.min

/**
 * The maximum number of fixed banks available.
 */
export const NUM_FIXED_BANKS = TRUE_FIXED_BANKS.length

/**
 * The various memory areas.
 * The nomenclature varies between documents and the choices here arbitrarily follow Ref SYM, IIB-3.
 */
export enum MemoryArea {
  Hardware,
  Special_Erasable,
  Unswitched_Banked_Erasable,
  Switched_Erasable,
  Fixed_Fixed,
  Variable_Fixed,
  Unaddressable
}

/**
 * Returns the memory area containing the specified address.
 * If the address is out of range, Unaddressable is returned.
 *
 * @param trueAddress the address to examine
 * @returns the memory area containing the specified address
 */
export function memoryArea (trueAddress: number): MemoryArea {
  if (trueAddress < 0) {
    return MemoryArea.Unaddressable
  } else if (trueAddress <= TRUE_RANGE_HARDWARE.max) {
    return MemoryArea.Hardware
  } else if (trueAddress <= TRUE_RANGE_SPECIAL.max) {
    return MemoryArea.Special_Erasable
  } else if (trueAddress <= TRUE_RANGE_UNSWITCHED_ERASABLE.max) {
    return MemoryArea.Unswitched_Banked_Erasable
  } else if (trueAddress <= TRUE_RANGE_SWITCHED_ERASABLE.max) {
    return MemoryArea.Switched_Erasable
  } else if (trueAddress <= TRUE_RANGE_FIXED_FIXED.max) {
    return MemoryArea.Fixed_Fixed
  } else if (trueAddress <= TRUE_RANGE_VARIABLE_FIXED_1.max) {
    return MemoryArea.Variable_Fixed
  } else if (trueAddress <= TRUE_RANGE_UNALLOCATED.max) {
    return MemoryArea.Unaddressable
  } else if (trueAddress <= TRUE_RANGE_VARIABLE_FIXED_2.max) {
    return MemoryArea.Variable_Fixed
  }
  return MemoryArea.Unaddressable
}

/**
 * Returns true iff the specified area is in the erasable range.
 *
 * @param area the area to examine
 * @returns true iff the specified area is in the erasable range
 */
export function isErasable (area: MemoryArea): boolean {
  switch (area) {
    case MemoryArea.Hardware:
    case MemoryArea.Special_Erasable:
    case MemoryArea.Unswitched_Banked_Erasable:
    case MemoryArea.Switched_Erasable:
      return true
  }
  return false
}

/**
 * Returns true iff the specified area is in the fixed range.
 *
 * @param area the area to examine
 * @returns true iff the specified area is in the fixed range
 */
export function isFixed (area: MemoryArea): boolean {
  return area === MemoryArea.Fixed_Fixed
    || area === MemoryArea.Variable_Fixed
}

/**
 * Returns the true address range for the specified fixed bank number.
 * If the bank number is outside the range [0, 43(8)], undefined is returned.
 *
 * @param bank the fixed bank number
 * @returns the true address range for the specified fixed bank number
 */
export function fixedBankRange (bank: number): Range | undefined {
  return bank < 0 || bank > TRUE_FIXED_BANKS.length ? undefined : TRUE_FIXED_BANKS[bank]
}

/**
 * Returns the number of the fixed bank ([0, 43(8)]) that contains the specified true address.
 * If the address is outside the fixed memory range, undefined is returned.
 *
 * @param trueAddress the address to examine
 * @returns the number of the fixed bank that contains the specified true address
 */
export function fixedBankNumber (trueAddress: number): number | undefined {
  const result = asBankAndAddress(trueAddress)
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
export function isErasableBank (bank: number): boolean {
  return bank >= 0 && bank <= 7
}

/**
 * Returns true iff the specified bank number corresponds to a fixed bank, i.e. is in the range [0, 43(8)].
 *
 * @param bank the bank number to examine
 * @returns true iff the specified bank number corresponds to a fixed bank
 */
export function isFixedBank (bank: number): boolean {
  return bank >= 0 && bank <= 35
}

/**
 * Returns the FBANK number and SBANK number if applicable for the specified fixed bank number.
 * If the bank number is outside the range [0, 43(8)], undefined is returned.
 *
 * @param bank the bank number to examine
 * @returns the FBANK number and SBANK number if applicable for the specified fixed bank number
 */
export function fixedBankNumberToBank (bank: number): { fBank: number, sBank?: number } | undefined {
  if (bank < 0 || bank > 35) {
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

function asErasableBankAndAddress (trueAddress: number): { bank: Bank, address: number } {
  const address = 0x300 + (trueAddress & 0xFF)
  const eBank = (trueAddress & 0x700) >> 8
  return { bank: { eBank }, address }
}

function asFixedBankAndAddress (trueAddress: number): { bank: Bank, address: number } {
  const fixed = trueAddress >= 0x1000 ? trueAddress - 0x1000 : trueAddress
  const address = 0x400 + (fixed & 0x3FF)
  const allSBank = ((fixed & 0xE000) >> 13) <= 3 ? 3 : 4
  const fBank = allSBank <= 3 ? (fixed & 0x7C00) >> 10 : 0x18 + ((fixed & 0x1C00) >> 10)
  const sBank = trueAddress < TRUE_RANGE_SUPERBANKS.min ? undefined : allSBank
  return { bank: { fBank, sBank }, address }
}

/**
 * Returns the bank information and S-register address for the specified true address.
 * If the address is outside the machine's memory range, undefined is returned.
 *
 * @param trueAddress the address to translate
 * @returns the bank information and S-register address for the specified true address
 */
export function asBankAndAddress (trueAddress: number): { bank: Bank, address: number } | undefined {
  const type = memoryArea(trueAddress)
  if (isErasable(type)) {
    return asErasableBankAndAddress(trueAddress)
  } else if (isFixed(type)) {
    return asFixedBankAndAddress(trueAddress)
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
export function asSwitchedBankAndAddress (trueAddress: number): { bank?: Bank, address: number } | undefined {
  const type = memoryArea(trueAddress)
  if (type === MemoryArea.Switched_Erasable) {
    return asErasableBankAndAddress(trueAddress)
  } else if (type === MemoryArea.Variable_Fixed) {
    return asFixedBankAndAddress(trueAddress)
  } else if (type !== MemoryArea.Unaddressable) {
    return { address: trueAddress }
  }
}

/**
 * Returns the fixed complete address for the specified true address.
 * This is the FBANK ([0, 37(8)]) in the 4 high bits and the S-register offset ([0, 1777(8)]) in the 10 low bits.
 * See Ref BTM, page 1-11.
 * If the address is outside the fixed memory range, undefined is returned.
 *
 * @param trueAddress the address to translate
 * @returns the fixed complete address for the specified true address
 */
export function asFixedCompleteAddress (trueAddress: number): number | undefined {
  const bankAndAddress = asBankAndAddress(trueAddress)
  if (bankAndAddress === undefined || bankAndAddress.bank.fBank === undefined) {
    return undefined
  }

  return bankAndAddress.bank.fBank << 10 | (bankAndAddress.address - 0x400)
}

function isLowMemoryInterpretive (trueAddress: number): boolean | undefined {
  if (trueAddress >= TRUE_FIXED_BANKS[4].min) {
    if (trueAddress <= TRUE_FIXED_BANKS[15].max) {
      return true
    }
    if (trueAddress >= TRUE_FIXED_BANKS[16].min && trueAddress <= TRUE_FIXED_BANKS[35].max) {
      return false
    }
  }
}

/**
 * Returns the interpretive fixed complete address, used for interpretive indexing.
 * The true address must be in the same "half-memory" as the location counter.
 * The returned value is the same as the fixed complete address for "low" half-memory, and similar for "high"
 * half-memory but with the FBANK offset by -20(8).
 * See Ref BTM, section 2.2.3.
 * If the address is not in the same half-memory as the location counter, undefined is returned.
 *
 * @param locationCounter
 * @param trueAddress
 * @returns
 */
export function asInterpretiveFixedAddress (locationCounter: number, trueAddress: number): number | undefined {
  const locationLow = isLowMemoryInterpretive(locationCounter)
  const addressLow = isLowMemoryInterpretive(trueAddress)
  if (addressLow === undefined || addressLow !== locationLow) {
    return undefined
  }

  const bankAndAddress = asBankAndAddress(trueAddress)
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
 * - If in fixed memory (fixed bank is in range [0, 43(8)]): <fixed bank> "," <SREG>
 * - If not addressable: <address> "?"
 *
 * @param trueAddress the address to format
 * @returns the assembly string formatted address
 */
export function asAssemblyString (trueAddress?: number): string {
  if (trueAddress === undefined) {
    return ''
  }

  const bankAndAddress = asSwitchedBankAndAddress(trueAddress)
  let bankField = ''
  if (bankAndAddress === undefined) {
    return trueAddress.toString(8) + '?'
  } else if (bankAndAddress.bank !== undefined) {
    if (bankAndAddress.bank.eBank !== undefined) {
      bankField = 'E' + bankAndAddress.bank.eBank.toString(8) + ','
    } else if (bankAndAddress.bank.fBank !== undefined) {
      if (bankAndAddress.bank.sBank !== 4) {
        bankField = bankAndAddress.bank.fBank.toString(8).padStart(2, '0') + ','
      } else {
        bankField = (bankAndAddress.bank.fBank + 8).toString(8) + ','
      }
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
export function paragraph (trueAddress: number): number | undefined {
  return isFixed(memoryArea(trueAddress)) ? Math.floor(trueAddress / 256) : undefined
}

/**
 * Returns the hardware module number for the specified fixed bank number.
 * Ref SYM, IIF-3.
 *
 * @param bank the fixed bank
 * @returns the module number 1-6, or undefined if bank is not a fixed bank number
 */
export function hardwareModule (bank: number): number | undefined {
  if (bank < 0 || bank > 35) {
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
export function hardwareSide (sRegister: number): string {
  return (sRegister & 0x100) === 0 ? 'A' : 'B'
}

/**
 * Returns the hardware strand (1 - 12) within a module for the specified bank and S-register address.
 * Ref SYM, IIF-3.
 *
 * @param bank the fixed bank
 * @param sRegister the S-register value
 */
export function hardwareStrand (bank: number, sRegister: number): number {
  return 2 * (bank % 6) + ((sRegister & 0x200) === 0 ? 0 : 1) + 1
}

/**
 * Returns the hardware wire range for the specified set.
 * Empirically from original assembly output.
 *
 * @param set the set
 * @returns the wire range
 */
export function hardwareWires (set: number): Range {
  const min = 1 + (set - 1) * 16
  const max = min + 15
  return { min, max }
}

/**
 * Returns the specified true address's offset from the start of memory, ignoring the unaddressable range [14000,17777].
 * No checking is done to ensure the address falls within the memory range.
 *
 * @param trueAddress the address to examine
 * @returns the specified true address's offset from the start of memory
 */
export function memoryOffset (trueAddress: number): number {
  return trueAddress < 0x1800 ? trueAddress : trueAddress - 0x800
}

/**
 * Returns the true memory address for the specified offset from the start of memory.
 * This is the complement to memoryOffset.
 * No range checking is done on the input.
 *
 * @param offset the offset from the start of memory, ignoring the unaddressable range [14000,17777]
 * @returns the true memory address for the specified offset from the start of memory
 */
export function memoryAddress (offset: number): number {
  return offset < 0x1800 ? offset : offset + 0x800
}
