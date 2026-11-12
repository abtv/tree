/** Conservative byte budget also leaves room for instructions and output in a 4K context. */
export const SUMMARY_INPUT_BYTES = 2400
export const SUMMARY_INTERMEDIATE_BYTES = 800
export const SUMMARY_OUTPUT_BYTES = 8000
export const SUMMARY_MAX_REQUESTS = 1000
export const SUMMARY_MAX_NODES = 100_000
export const SUMMARY_MAX_SOURCE_BYTES = 16 * 1024 * 1024

export interface SummarizationPort {
  available(): Promise<boolean>
  begin(id: string): Promise<void>
  reduce(id: string, text: string, final: boolean): Promise<string>
  finish(id: string, text: string): Promise<void>
  /** False means the final clipboard commit already started; it cannot be undone. */
  cancel(id: string): Promise<boolean | void>
}
