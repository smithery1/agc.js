import * as fs from 'fs'
import * as http from 'http'
import * as stream from 'stream'
import { URL as NodeURL } from 'url'
import { Compat, InputStream, ReadResult, setCompat } from '../compat'

class NodeCompat implements Compat {
  async fetch (input: string): Promise<InputStream> {
    const url = new NodeURL(input)

    if (url.protocol === 'file:') {
      return await Promise.resolve(new NodeStream(fs.createReadStream(url)))
    } else {
      return await new Promise<InputStream>((resolve) => {
        http.request(input, response => {
          resolve(new NodeStream(response))
        })
      })
    }
  }

  log (...data: any[]): void {
    console.log(...data)
  }

  error (...data: any[]): void {
    console.error(...data)
  }

  output (...data: any[]): void {
    console.log(...data)
  }
}

setCompat(new NodeCompat())

class NodeStream implements InputStream {
  private isOpen: boolean
  private resolving: (arg0: ReadResult) => void
  private rejecting: (arg0: Error) => void

  constructor (private readonly nodeStream: stream.Readable) {
    this.nodeStream = nodeStream
    this.nodeStream.setEncoding('utf-8')
    this.isOpen = true
    this.nodeStream.pause()
    this.nodeStream.on('data', (chunk) => this.resolving(this.onData(chunk as string)))
    this.nodeStream.on('end', () => this.resolving(this.onEnd()))
    this.nodeStream.on('close', () => { if (this.isOpen) { this.rejecting(this.onClose()) } })
    this.nodeStream.on('error', (error) => this.rejecting(this.onError(error)))
  }

  async read (): Promise<ReadResult> {
    return await new Promise<ReadResult>(
      (resolve, reject) => {
        if (this.isOpen) {
          this.resolving = resolve
          this.rejecting = reject
          this.nodeStream.resume()
        } else {
          resolve({ done: true, value: '' })
        }
      }
    )
  }

  private onData (chunk: string): ReadResult {
    this.nodeStream.pause()
    return { done: false, value: chunk }
  }

  private onEnd (): ReadResult {
    this.nodeStream.pause()
    this.isOpen = false
    return { done: true, value: '' }
  }

  private onClose (): Error {
    this.nodeStream.pause()
    this.isOpen = false
    return new Error('unexpected close')
  }

  private onError (error: Error): Error {
    this.nodeStream.pause()
    this.isOpen = false
    return error
  }
}
