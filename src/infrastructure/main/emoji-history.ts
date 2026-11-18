import { normalizeEmojiHistory } from '../../domain/emoji-completion'
import { createJsonPreferenceStore } from './json-preference'

export function createEmojiHistoryStore(path: string) {
  return createJsonPreferenceStore(path, normalizeEmojiHistory)
}
