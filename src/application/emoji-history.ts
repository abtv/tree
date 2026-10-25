import { initialEmojiSuggestions, normalizeEmojiHistory } from '../domain/emoji-completion'

/** Application-wide preference, independent of document edits and Undo. */
export class EmojiHistory {
  private names: string[] = []
  public suggestions = initialEmojiSuggestions([])
  private revision = 0
  private saved = 0
  private pending = Promise.resolve()

  public constructor(
    private readonly write: ((names: readonly string[]) => Promise<void>) | undefined,
    private readonly report: (error: unknown) => void,
  ) {}

  public load(value: unknown): void {
    this.names = normalizeEmojiHistory(value)
    this.suggestions = initialEmojiSuggestions(this.names)
  }

  public remember(shortcode: string): void {
    const next = normalizeEmojiHistory([shortcode, ...this.names])
    if (next.every((name, index) => name === this.names[index]) && next.length === this.names.length) {
      if (this.saved !== this.revision) void this.flush().catch(this.report)
      return
    }
    this.names = next
    this.suggestions = initialEmojiSuggestions(next)
    this.revision++
    void this.flush().catch(this.report)
  }

  public flush(): Promise<void> {
    this.pending = this.pending
      .catch(() => undefined)
      .then(async () => {
        if (this.write === undefined) return
        while (this.saved !== this.revision) {
          const revision = this.revision
          await this.write(this.names)
          this.saved = revision
        }
      })
    return this.pending
  }
}
