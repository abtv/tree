import { Inflate } from 'fflate'
import type { CreateInflater } from '../../application/notes-archive/zip-reader'

/**
 * Raw Deflate decoding through fflate's synchronous `Inflate` stream. fflate copies each produced
 * chunk, so the reader may keep it. No async fflate API is used (ADR 0022).
 */
export const createInflater: CreateInflater = (onData) => {
  const inflate = new Inflate((chunk) => onData(chunk))
  return { push: (chunk, final) => inflate.push(chunk, final) }
}
