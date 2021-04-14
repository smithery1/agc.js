/**
 * A Honeywell or an EBCDIC character set representation that can sort strings.
 */
export interface CharSet {
  compare: (str1: string, str2: string) => number
}

/**
 * The character sets available.
 */
export enum CharSetType {
  EBCDIC,
  HONEYWELL_800
}

/**
 * Returns the character set for the specified type.
 *
 * @param set the character set type
 * @returns the character set
 */
export function getCharset (set: CharSetType): CharSet {
  if (set === CharSetType.HONEYWELL_800) {
    return H800_CHARSET
  }
  return EBCDIC_CHARSET
}

type Convert = (ascii: number) => number

function compare (str1: string, str2: string, convert: Convert): number {
  const length = Math.min(str1.length, str2.length)

  for (let i = 0; i < length; i++) {
    const c1 = convert(str1.charCodeAt(i))
    const c2 = convert(str2.charCodeAt(i))

    if (c1 > c2) {
      return 1
    } else if (c1 < c2) {
      return -1
    }
  }

  if (length === str1.length) {
    if (length === str2.length) {
      return 0
    }
    return compareSpaces(str2)
  } else {
    return -compareSpaces(str1)
  }

  function compareSpaces (str: string): number {
    const space = convert(32)
    for (let i = length; i < str.length; i++) {
      const c = convert(str.charCodeAt(i))
      if (space > c) {
        return 1
      } else if (space < c) {
        return -1
      }
    }

    return 0
  }
}

const PRINTABLE_ASCII_TO_EBCDIC = [
  64, // (Space)
  90, // !
  127, // "
  123, // #
  91, // $
  108, // %
  80, // &
  125, // '
  77, // (
  93, // )
  92, // *
  78, // +
  107, // ,
  96, // -
  75, // .
  97, // /
  240, // 0
  241, // 1
  242, // 2
  243, // 3
  244, // 4
  245, // 5
  246, // 6
  247, // 7
  248, // 8
  249, // 9
  122, // :
  94, // ;
  110, // <
  126, // =
  76, // >
  111, // ?
  124, // @
  193, // A
  194, // B
  195, // C
  196, // D
  197, // E
  198, // F
  199, // G
  200, // H
  201, // I
  209, // J
  210, // K
  211, // L
  212, // M
  213, // N
  214, // O
  215, // P
  216, // Q
  217, // R
  226, // S
  227, // T
  228, // U
  229, // V
  230, // W
  231, // X
  232, // Y
  233, // Z
  347, // [ (no equivalent)
  224, // \
  349, // ] (no equivalent)
  350, // ^ (no equivalent)
  351, // _ (no equivalent)
  121, // `
  129, // a
  130, // b
  131, // c
  132, // d
  133, // e
  134, // f
  135, // g
  136, // h
  137, // i
  145, // j
  146, // k
  147, // l
  148, // m
  149, // n
  150, // o
  151, // p
  152, // q
  153, // r
  162, // s
  163, // t
  164, // u
  165, // v
  166, // w
  167, // x
  168, // y
  169, // z
  192, // {
  106, // |
  208, // }
  161 // ~
]

const EBCDIC_TABLE_START = ' '.charCodeAt(0)
const EBCDIC_TABLE_END = '~'.charCodeAt(0)

function convertEbcdic (ascii: number): number {
  if (ascii < EBCDIC_TABLE_START || ascii > EBCDIC_TABLE_END) {
    return 256 + ascii
  }

  return PRINTABLE_ASCII_TO_EBCDIC[ascii - EBCDIC_TABLE_START]
}

function compareEbcdic (str1: string, str2: string): number {
  return compare(str1, str2, convertEbcdic)
}

const EBCDIC_CHARSET: CharSet = { compare: compareEbcdic }

const PRINTABLE_ASCII_TO_H800 = [
  13, // (Space)
  289, // ! (no equivalent)
  45, // "
  42, // #
  43, // $
  29, // %
  15, // &
  10, // '
  60, // (
  28, // )
  44, // *
  16, // +
  59, // ,
  32, // -
  27, // .
  49, // /
  0, // 0
  1, // 1
  2, // 2
  3, // 3
  4, // 4
  5, // 5
  6, // 6
  7, // 7
  8, // 8
  9, // 9
  12, // :
  26, // ;
  316, // < (no equivalent)
  11, // =
  318, // > (no equivalent)
  47, // ?
  58, // @
  17, // A
  18, // B
  19, // C
  20, // D
  21, // E
  22, // F
  23, // G
  24, // H
  25, // I
  33, // J
  34, // K
  35, // L
  36, // M
  37, // N
  38, // O
  39, // P
  40, // Q
  41, // R
  50, // S
  51, // T
  52, // U
  53, // V
  54, // W
  55, // X
  56, // Y
  57 // Z
]

const H800_TABLE_START = ' '.charCodeAt(0)
const H800_TABLE_END = '~'.charCodeAt(0)

function convertH800 (ascii: number): number {
  if (ascii < H800_TABLE_START || ascii > H800_TABLE_END) {
    return 256 + ascii
  }

  return PRINTABLE_ASCII_TO_H800[ascii - H800_TABLE_START]
}

function compareH800 (str1: string, str2: string): number {
  return compare(str1, str2, convertH800)
}

const H800_CHARSET: CharSet = { compare: compareH800 }
