export interface Range {
  min: number
  max: number
}

export interface Bank {
  eBank?: number
  fBank?: number
  sBank?: number
}

const TRUE_RANGE_HARDWARE = { min: 0, max: 8 }
const TRUE_RANGE_SPECIAL = { min: 9, max: 0x30 }
const TRUE_RANGE_UNSWITCHED_ERASABLE = { min: 0x30, max: 0x2FF }
const TRUE_RANGE_SWITCHED_ERASABLE = { min: 0x300, max: 0x7FF }
const TRUE_RANGE_FIXED_FIXED = { min: 0x800, max: 0xFFF }
const TRUE_RANGE_VARIABLE_FIXED_1 = { min: 0x1000, max: 0x17FF }
const TRUE_RANGE_UNALLOCATED = { min: 0x1800, max: 0x1FFF }
const TRUE_RANGE_VARIABLE_FIXED_2 = { min: 0x2000, max: 0x9FFF }

const TRUE_RANGE_SUPERBANKS = { min: 0x7000, max: 0x9FFF }

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

export const MEMORY_MAX = 0x9FFF
export const FIXED_MEMORY_SIZE = MEMORY_MAX - 0x1000
export const S_REGISTER_MASK = 0x7FFF

export enum AddressType {
  Hardware,
  Special_Erasable,
  Unswitched_Banked_Erasable,
  Switched_Erasable,
  Fixed_Fixed,
  Variable_Fixed,
  Unaddressable
}

export function addressType (trueAddress: number): AddressType {
  if (trueAddress < 0) {
    return AddressType.Unaddressable
  } else if (trueAddress <= TRUE_RANGE_HARDWARE.max) {
    return AddressType.Hardware
  } else if (trueAddress <= TRUE_RANGE_SPECIAL.max) {
    return AddressType.Special_Erasable
  } else if (trueAddress <= TRUE_RANGE_UNSWITCHED_ERASABLE.max) {
    return AddressType.Unswitched_Banked_Erasable
  } else if (trueAddress <= TRUE_RANGE_SWITCHED_ERASABLE.max) {
    return AddressType.Switched_Erasable
  } else if (trueAddress <= TRUE_RANGE_FIXED_FIXED.max) {
    return AddressType.Fixed_Fixed
  } else if (trueAddress <= TRUE_RANGE_VARIABLE_FIXED_1.max) {
    return AddressType.Variable_Fixed
  } else if (trueAddress <= TRUE_RANGE_UNALLOCATED.max) {
    return AddressType.Unaddressable
  } else if (trueAddress <= TRUE_RANGE_VARIABLE_FIXED_2.max) {
    return AddressType.Variable_Fixed
  }
  return AddressType.Unaddressable
}

export function isBankedErasable (type: AddressType): boolean {
  switch (type) {
    case AddressType.Unswitched_Banked_Erasable:
    case AddressType.Switched_Erasable:
      return true
  }
  return false
}

export function isErasable (type: AddressType): boolean {
  switch (type) {
    case AddressType.Hardware:
    case AddressType.Special_Erasable:
    case AddressType.Unswitched_Banked_Erasable:
    case AddressType.Switched_Erasable:
      return true
  }
  return false
}

export function isUnswitchedErasable (type: AddressType): boolean {
  switch (type) {
    case AddressType.Hardware:
    case AddressType.Special_Erasable:
    case AddressType.Unswitched_Banked_Erasable:
      return true
  }
  return false
}

export function isFixed (type: AddressType): boolean {
  return type === AddressType.Fixed_Fixed
    || type === AddressType.Variable_Fixed
}

export function fixedBankRange (bank: number): Range | undefined {
  return bank < 0 || bank > TRUE_FIXED_BANKS.length ? undefined : TRUE_FIXED_BANKS[bank]
}

export function fixedBankNumber (trueAddress: number): number | undefined {
  const result = asBankAndAddress(trueAddress)
  if (result?.bank.fBank === undefined) {
    return undefined
  }

  return result.bank.sBank === 4 ? result.bank.fBank + 8 : result.bank.fBank
}

export function isErasableBank (bank: number): boolean {
  return bank >= 0 && bank <= 7
}

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

export function asBankAndAddress (trueAddress: number): { bank: Bank, address: number } | undefined {
  const type = addressType(trueAddress)
  if (isErasable(type)) {
    return asErasableBankAndAddress(trueAddress)
  } else if (isFixed(type)) {
    return asFixedBankAndAddress(trueAddress)
  }
}

export function asFixedAddress (trueAddress: number): number | undefined {
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

export function asSwitchedBankAndAddress (trueAddress: number): { bank?: Bank, address: number } | undefined {
  const type = addressType(trueAddress)
  if (type === AddressType.Switched_Erasable) {
    return asErasableBankAndAddress(trueAddress)
  } else if (type === AddressType.Variable_Fixed) {
    return asFixedBankAndAddress(trueAddress)
  } else if (type !== AddressType.Unaddressable) {
    return { address: trueAddress }
  }
}

export function asSwitchedBankNumberAndAddress (trueAddress: number): { bank?: number, address: number } | undefined {
  const result = asSwitchedBankAndAddress(trueAddress)
  if (result === undefined) {
    return undefined
  } else if (result.bank === undefined) {
    return { address: result.address }
  } else if (result.bank.fBank === undefined) {
    return { bank: result.bank.eBank, address: result.address }
  } else if (result.bank.sBank !== 4) {
    return { bank: result.bank.fBank, address: result.address }
  } else {
    return { bank: result.bank.fBank + 8, address: result.address }
  }
}

export function asAssemblyString (trueAddress?: number): string {
  if (trueAddress === undefined) {
    return ''
  }

  const bankAndAddress = asSwitchedBankNumberAndAddress(trueAddress)
  if (bankAndAddress === undefined) {
    return trueAddress.toString(8) + '?'
  }
  let bankField: string
  if (bankAndAddress.bank === undefined) {
    bankField = ''
  } else {
    bankField = bankAndAddress.bank.toString(8)
    if (isErasable(addressType(trueAddress))) {
      bankField = 'E' + bankField
    } else {
      bankField = bankField.padStart(2, '0')
    }
    bankField += ','
  }
  const addressField = bankAndAddress.address.toString(8).padStart(4, '0')
  return bankField + addressField
}

export function paragraph (trueAddress: number): number | undefined {
  return isFixed(addressType(trueAddress)) ? Math.floor(trueAddress / 256) : undefined
}

export function fixedMemoryOffset (trueAddress: number): number {
  if (trueAddress < 0x1800) {
    return trueAddress - 0x800
  } else {
    return trueAddress - 0x1000
  }
}
export function fixedMemoryAddress (offset: number): number {
  if (offset < 0x1000) {
    return offset + 0x800
  }
  return offset + 0x1000
}
