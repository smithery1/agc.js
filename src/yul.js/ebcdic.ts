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

const TABLE_START = ' '.charCodeAt(0)
const TABLE_END = '~'.charCodeAt(0)

/**
 * Returns the EBCDIC code equivalent to the specified ASCII code.
 * If there is no equivalent, returns the ASCII code plus 256.
 *
 * @param ascii the ASCII code
 * @returns the EBCDIC code equivalent to the specified ASCII code
 */
export function asciiToEbcdic (ascii: number): number {
  if (ascii < TABLE_START || ascii > TABLE_END) {
    return 256 + ascii
  }

  return PRINTABLE_ASCII_TO_EBCDIC[ascii - TABLE_START]
}
