import { AssembledCard, getCusses } from './assembly'
import * as cusses from './cusses'
import { SymbolTable } from './symbol-table'

export interface Offset {
  readonly value: number
}

export interface AddressField {
  readonly value: string | number | Offset
  readonly offset?: number
}

export interface TrueAddress {
  readonly address: number
  readonly offset: number
}

export function resolve (
  address: AddressField | undefined, locationCounter: number | undefined, requester: AssembledCard, table: SymbolTable):
  TrueAddress | undefined {
  if (address === undefined) {
    if (locationCounter === undefined) {
      getCusses(requester).add(cusses.Cuss35)
      return undefined
    }
    return { address: locationCounter, offset: 0 }
  }

  let value: number
  let offset = address.offset ?? 0

  if (typeof address.value === 'number') {
    value = address.value
  } else if (typeof address.value === 'string') {
    const result = table.resolve(address.value, requester)
    if (result === undefined) {
      getCusses(requester).add(cusses.Cuss2D)
      return undefined
    }
    value = result + offset
    offset = 0
  } else if (locationCounter !== undefined) {
    value = locationCounter + address.value.value
  } else {
    getCusses(requester).add(cusses.Cuss35)
    return undefined
  }

  return { address: value, offset }
}

export type Resolver = (symbol: string) => number | undefined

export function resolvePass1Referenced (
  address: AddressField, locationCounter: number | undefined, requester: AssembledCard | undefined, resolver: Resolver):
  number | undefined {
  let value: number

  if (typeof address.value === 'number') {
    value = address.value
  } else if (typeof address.value === 'string') {
    const result = resolver(address.value)
    if (result === undefined) {
      return undefined
    }
    value = result
  } else if (address.value === undefined) {
    value = 0
  } else if (locationCounter !== undefined) {
    value = locationCounter + address.value.value
  } else {
    if (requester !== undefined) {
      getCusses(requester).add(cusses.Cuss35, 'No location counter for offset')
    }
    return undefined
  }

  return value + (address.offset ?? 0)
}
