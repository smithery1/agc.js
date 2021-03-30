const ZEROS = ['', '0', '00', '000', '0000']

export function octalString (input: number): string {
  const str = input.toString(8)
  const full = ZEROS[5 - str.length] + str

  return full
}
