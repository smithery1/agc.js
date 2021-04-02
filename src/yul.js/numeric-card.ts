import * as cusses from './cusses'
import { Operation } from './operations'
import { isWhitespace } from './util'

//
// The format of the numeric constant cards is from Ref YUL, 13-139 "Numeric Constant Cards".
// Most of the logic here is based on that information.
//

/**
 * The result of lexing a numeric card field.
 * Contains a low word an optional high for double-precision fields.
 */
export interface Words {
  highWord?: number
  lowWord: number
}

// "Mantissa" naming per Ref YUL, 13-145 and 13-147
interface Mantissa { whole: string, fractional: string }
interface Parts { positive?: boolean, mantissa?: Mantissa, exponent?: number, scaling?: number }

const OCTAL_EXPR = /[0-7]*\.?[0-7]*/
const DECIMAL_EXPR = /\d+/

const SP_INT_MAX = 0x4000
const DP_INT_MAX = 0x10000000
const SP_LOGICAL_MAX = 0x8000
const DP_LOGICAL_MAX = 0x40000000
const SP_NEGATE_MASK = 0x7FFF
const DP_LOW_INT_WORD_MASK = 0x3FFF
const DP_LOW_LOGICAL_WORD_MASK = 0x7FFF
// Ref YUL, 13-143 says only 10 decimal and 14 octal significant digits are allowed, and anything beyond is truncated.
// But code has more than that, and truncating results in mismatched values vs. actual.
// So allow more here.
const DECIMAL_MAX_DIGITS = 20
const OCTAL_MAX_DIGITS = 24

/**
 * Attempts to translate the specified token into a number based on the specified operation.
 * Failure to do so results in one or more cusses added to localCusses and returning undefined.
 * The operation must be DEC, 2DEC, OCT, or 2OCT.
 *
 * @param op the operation whose operand is given in token
 * @param isExtended whether the token is an "extended" address field (Ref YUL, 13-142)
 * @param token the address field token
 * @param localCusses cusses to added to on lexing errors
 * @returns the lexed number(s)
 */
export function lexNumeric (
  op: Operation, isExtended: boolean, token: string, localCusses: cusses.Cusses): Words | undefined {
  const isDp = op.words === 2
  switch (op.symbol) {
    case 'DEC':
    case '2DEC':
      return lexDecimal(token, isDp, isExtended, localCusses)

    case 'OCT':
    case '2OCT':
      return lexOctal(token, isDp, isExtended, localCusses)

    default:
      return lexSimpleDecimal(token, localCusses)
  }
}

function lexSimpleDecimal (token: string, localCusses: cusses.Cusses): Words | undefined {
  if (!DECIMAL_EXPR.test(token)) {
    localCusses.add(cusses.Cuss3D)
    return undefined
  }
  if (token.length > 10) {
    localCusses.add(cusses.Cuss1C)
    return undefined
  }

  const result = Number.parseInt(token)
  return { lowWord: result }
}

function lexDecimal (
  token: string, isDp: boolean, isExtended: boolean, localCusses: cusses.Cusses): Words | undefined {
  const parsedParts = numericParts(token, isExtended)
  if (cusses.isCuss(parsedParts)) {
    localCusses.add(parsedParts)
    return undefined
  }
  const parsed = parsedParts

  const { whole, fractional } = checkTruncate(parsed.mantissa, false, localCusses)

  let exp = parsed.exponent === undefined ? 0 : parsed.exponent
  const adjustedExp = exp + whole.length
  if (adjustedExp > 63 || adjustedExp < -64) {
    localCusses.add(cusses.Cuss1E)
    return undefined
  }

  const scaling = parsed.scaling === undefined ? 0 : parsed.scaling
  exp -= fractional.length

  const wholeNumber = whole.length === 0 ? 0 : Number.parseInt(whole)
  const fractionalNumber = fractional.length === 0 ? 0 : Number.parseInt(fractional)
  let decimal = wholeNumber * Math.pow(10, fractional.length) + fractionalNumber
  const { numerator: scaleNum, denominator: scaleDenom } = base10Scaling(exp, scaling)
  const max = isDp ? DP_INT_MAX : SP_INT_MAX
  if (scaleNum > scaleDenom && decimal > max) {
    // Ref YUL, 13-147. Out of range, so don't both scaling.
    localCusses.add(cusses.Cuss1E)
    return undefined
  }
  decimal *= scaleNum / scaleDenom

  // Ref YUL, 13-147
  if (decimal < 1) {
    // Value less than 1 is converted to binary and rounded
    decimal = fraction(decimal, isDp)
  } else if (decimal > max) {
    localCusses.add(cusses.Cuss1E, decimal.toString())
    decimal = max
  } else if (!Number.isInteger(decimal)) {
    // Value greater than one with a fractional component is warned and truncated
    localCusses.add(cusses.Cuss1D, decimal.toString())
    decimal = Math.floor(decimal)
  }

  const result = signedWords(decimal, isDp, parsed.positive)
  return result
}

function lexOctal (
  token: string, isDp: boolean, isExtended: boolean, localCusses: cusses.Cusses): Words | undefined {
  const parsedParts = numericParts(token, isExtended)
  if (cusses.isCuss(parsedParts)) {
    localCusses.add(parsedParts)
    return undefined
  }
  const parsed = parsedParts

  if (parsed.mantissa !== undefined
    && (!OCTAL_EXPR.test(parsed.mantissa.whole) || !OCTAL_EXPR.test(parsed.mantissa.fractional))) {
    localCusses.add(cusses.Cuss21)
    return undefined
  }

  if (parsed.exponent !== undefined) {
    localCusses.add(cusses.Cuss39)
  }

  const { whole, fractional } = checkTruncate(parsed.mantissa, true, localCusses)

  const wholeNumber = whole.length === 0 ? 0 : Number.parseInt(whole, 8)
  const fractionalNumber = fractional.length === 0 ? 0 : Number.parseInt(fractional, 8)
  let octal = wholeNumber * Math.pow(8, fractional.length) + fractionalNumber

  const scaling = parsed.scaling === undefined ? 0 : parsed.scaling
  const scale = 1 << Math.abs(scaling)
  if (scaling < 0) {
    octal /= scale
  } else {
    octal *= scale
  }

  // Ref YUL, 13-145.
  let max: number
  if (parsed.positive === undefined) {
    max = isDp ? DP_LOGICAL_MAX : SP_LOGICAL_MAX
  } else {
    max = isDp ? DP_INT_MAX : SP_INT_MAX
  }
  if (octal > max) {
    localCusses.add(cusses.Cuss1E, octal.toString(8))
    octal = max
  } else if (!Number.isInteger(octal)) {
    // Value with a fractional component is warned and truncated
    localCusses.add(cusses.Cuss1D, octal.toString(8))
    octal = Math.floor(octal)
  }

  const result = parsed.positive === undefined ? logicalWords(octal, isDp) : signedWords(octal, isDp, parsed.positive)
  return result
}

function numericParts (token: string, isExtended: boolean): Parts | cusses.Cuss {
  if (isExtended) {
    if (token.charAt(token.length - 1) !== '*') {
      return cusses.Cuss02
    }

    token = token.substring(0, token.length - 1)
    if (token.length === 0) {
      return cusses.Cuss3D
    }
  }

  let index = 0
  const positive = parseSign()

  const parsedMantissa = parseMantissa()
  if (cusses.isCuss(parsedMantissa)) {
    return parsedMantissa
  }
  const mantissa = parsedMantissa as Mantissa

  const parsedExponent = parseFactor('E', 100)
  if (cusses.isCuss(parsedExponent)) {
    return parsedExponent
  }
  const exponent = parsedExponent as number

  const parsedScaling = parseFactor('B', 1000)
  if (cusses.isCuss(parsedScaling)) {
    return parsedScaling
  }
  const scaling = parsedScaling as number

  if ((mantissa === undefined && exponent === undefined && scaling === undefined) || index !== token.length) {
    return cusses.Cuss3D
  }

  return { positive, mantissa, exponent, scaling }

  function parseSign (): boolean | undefined {
    const char = token.charAt(index)
    if (char === '-') {
      ++index
      return false
    } else if (char === '+') {
      ++index
      return true
    }
    return undefined
  }

  function parseMantissa (): Mantissa | cusses.Cuss | undefined {
    let accumulating = ''
    let parsingWhole = true
    let whole = ''
    let fractional = ''
    let fractionalZeros = ''
    let leadingZero = false

    while (index < token.length) {
      const char = token.charAt(index)

      if (char === '.') {
        if (parsingWhole) {
          whole = accumulating
          parsingWhole = false
          accumulating = ''
        } else {
          return cusses.Cuss3D
        }
      } else if (char === '0') {
        if (parsingWhole) {
          if (accumulating.length > 0) {
            accumulating += char
          } else {
            leadingZero = true
          }
        } else {
          fractionalZeros += char
        }
      } else if (char > '0' && char <= '9') {
        if (fractionalZeros.length > 0) {
          accumulating += fractionalZeros
          fractionalZeros = ''
        }
        accumulating += char
      } else if (!isWhitespace(char)) {
        break
      }

      ++index
    }

    if (parsingWhole) {
      if (accumulating.length === 0 && !leadingZero) {
        return undefined
      }
      whole = accumulating
    } else {
      fractional = accumulating
    }

    return { whole, fractional }
  }

  function parseFactor (type: string, max: number): number | cusses.Cuss | undefined {
    if (index === token.length || token.charAt(index) !== type) {
      return undefined
    }
    if (token.length === 0) {
      return cusses.Cuss3D
    }

    ++index
    let positive: boolean
    let char = token.charAt(index)
    if (char === '-') {
      positive = false
      ++index
    } else {
      positive = true
      if (char === '+') {
        ++index
      }
    }

    let accumulating = ''
    while (index < token.length) {
      char = token.charAt(index)

      if (char >= '0' && char <= '9') {
        accumulating += char
      } else if (!isWhitespace(char)) {
        break
      }

      ++index
    }

    if (accumulating.length === 0) {
      return cusses.Cuss3D
    }

    let exp = parseInt(accumulating, 10)
    if (exp > max) {
      return cusses.Cuss1E
    }
    if (!positive) {
      exp = -exp
    }

    return exp
  }
}

function checkTruncate (mantissa: Mantissa | undefined, isOctal: boolean, localCusses: cusses.Cusses): Mantissa {
  let whole: string
  let fractional: string

  if (mantissa === undefined) {
    whole = '1'
    fractional = ''
  } else {
    // Ref YUL, 13-143. Warn and ignore any digits beyond the max significant.
    const maxSignificant = isOctal ? OCTAL_MAX_DIGITS : DECIMAL_MAX_DIGITS
    whole = mantissa.whole
    fractional = mantissa.fractional
    let excess = whole.length + fractional.length - maxSignificant
    if (excess > 0) {
      localCusses.add(isOctal ? cusses.Cuss1B : cusses.Cuss1C)
      const trim = Math.min(fractional.length, maxSignificant)
      fractional = fractional.substring(0, trim)
      excess -= trim
      whole = whole.substring(0, whole.length - excess)
    }
  }

  return { whole, fractional }
}

function base10Scaling (exp: number, scaling: number): { numerator: number, denominator: number } {
  if (exp > 0 && scaling > 0) {
    const numerator = Math.pow(10, exp) * Math.pow(2, scaling)
    return { numerator, denominator: 1 }
  } else if (exp < 0 && scaling < 0) {
    const denominator = Math.pow(10, -exp) * Math.pow(2, -scaling)
    return { numerator: 1, denominator }
  } else if (exp > 0) {
    if (exp > -scaling) {
      const numerator = Math.pow(5, -scaling) * Math.pow(10, exp + scaling)
      return { numerator, denominator: 1 }
    } else {
      const numerator = Math.pow(5, exp)
      const denominator = Math.pow(2, -scaling - exp)
      return { numerator, denominator }
    }
  } else {
    if (-exp > scaling) {
      const denominator = Math.pow(5, scaling) * Math.pow(10, -exp - scaling)
      return { numerator: 1, denominator }
    } else {
      const numerator = Math.pow(2, scaling + exp)
      const denominator = Math.pow(5, -exp)
      return { numerator, denominator }
    }
  }
}

function fraction (input: number, isDp: boolean): number {
  const bits = isDp ? 29 : 15
  let result = input * (1 << bits)

  if ((result & 1) === 1) {
    const max = isDp ? DP_INT_MAX : SP_INT_MAX
    result >>= 1
    // Be careful not to round into overflow.
    // This can occur - see Luminary099 constant ABOUTONE.
    if (result < max - 1) {
      ++result
    }
  } else {
    result >>= 1
  }

  return result
}

function signedWords (input: number, isDp: boolean, isPositive: boolean | undefined): Words {
  const negate = isPositive !== undefined && !isPositive
  if (isDp) {
    let highWord = input >> 14
    let lowWord = input & DP_LOW_INT_WORD_MASK
    if (negate) {
      highWord ^= SP_NEGATE_MASK
      lowWord ^= SP_NEGATE_MASK
    }
    return { highWord, lowWord }
  } else {
    let word = input
    if (negate) {
      word ^= SP_NEGATE_MASK
    }
    return { lowWord: word }
  }
}

function logicalWords (input: number, isDp: boolean): Words {
  if (isDp) {
    const highWord = input >> 15
    const lowWord = input & DP_LOW_LOGICAL_WORD_MASK
    return { highWord, lowWord }
  } else {
    return { lowWord: input }
  }
}
