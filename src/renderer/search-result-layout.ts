const blockSize = 128

/** Immutable result positions. Only blocks containing newly measured rows need new row offsets. */
export class SearchResultLayout {
  private constructor(
    private readonly base: Float64Array,
    private readonly blocks = new Map<number, Float64Array>(),
    private readonly blockOffsets = new Float64Array(Math.ceil((base.length - 1) / blockSize) + 1),
  ) {}

  public static estimate(count: number, height: (index: number) => number): SearchResultLayout {
    const offsets = new Float64Array(count + 1)
    for (let index = 0; index < count; index++) offsets[index + 1] = offsets[index]! + height(index)
    return new SearchResultLayout(offsets)
  }

  public readonly offsetAt = (index: number): number => {
    const block = Math.floor(index / blockSize)
    return this.base[index]! + this.blockOffsets[block]! + (this.blocks.get(block)?.[index % blockSize] ?? 0)
  }

  public get total(): number {
    return this.offsetAt(this.base.length - 1)
  }

  public heightAt(index: number): number {
    return this.offsetAt(index + 1) - this.offsetAt(index)
  }

  public withMeasurements(heights: ReadonlyMap<number, number>): SearchResultLayout {
    if (heights.size === 0) return this
    const nextBlocks = new Map(this.blocks)
    const copied = new Set<number>()
    let first = this.blockOffsets.length - 1
    for (const [index, height] of heights) {
      const delta = height - this.heightAt(index)
      if (delta === 0) continue
      const block = Math.floor(index / blockSize)
      if (!copied.has(block)) {
        nextBlocks.set(block, this.blocks.get(block)?.slice() ?? new Float64Array(blockSize + 1))
        copied.add(block)
        first = Math.min(first, block)
      }
      const offsets = nextBlocks.get(block)!
      for (let position = (index % blockSize) + 1; position <= blockSize; position++)
        offsets[position] = offsets[position]! + delta
    }
    if (copied.size === 0) return this

    const offsets = this.blockOffsets.slice()
    for (let block = first; block + 1 < offsets.length; block++)
      offsets[block + 1] = offsets[block]! + (nextBlocks.get(block)?.[blockSize] ?? 0)
    return new SearchResultLayout(this.base, nextBlocks, offsets)
  }
}
