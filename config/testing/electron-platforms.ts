// Unknown files stay on macOS. Mixed files opt individual functional cases into
// Linux with a tag; screenshot/native cases keep their existing macOS ownership.
export const linuxTag = /@linux\b/
export const linuxFiles = [
  'deletion',
  'empty-node',
  'tab-structure',
  'undo-sessions',
  'vim-counters',
  'local-search',
  'recent-nodes',
  'agenda-search',
  'tag-completion',
  'emoji-completion',
  'external-drop',
  'csp',
  'renderer-failures',
  'notes-archive-boundary',
  'notes-replacement-recovery',
].map((name) => `${name}.spec.ts`)

// Small deliberate overlap protects platform launch/persistence and fixture reuse.
export const sharedFiles = ['initial-state.spec.ts', 'shared-application.spec.ts']
export const sharedClipboardTitles = /pastes plain text at the cursor|cuts a hyperlink and pastes it into another node/

export function specPattern(files: readonly string[]): RegExp {
  return new RegExp(`/(?:${files.map((file) => file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`)
}
