
export interface ReadResult {
  done: boolean
  value: string
}

export interface InputStream {
  read: () => Promise<ReadResult>
}

export interface Compat {
  fetch: (input: RequestInfo, init?: RequestInit) => Promise<InputStream>
  log: (...data: any[]) => void
  error: (...data: any[]) => void
  output: (...data: any[]) => void
}

export let compat: Compat

export function setCompat (newCompat: Compat): void {
  compat = newCompat
}
