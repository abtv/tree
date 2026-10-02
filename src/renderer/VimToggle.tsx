import { StatusToggle } from './StatusToggle'

export function VimToggle({ vimEnabled, onToggle }: { vimEnabled: boolean; onToggle: () => void }): React.JSX.Element {
  return (
    <StatusToggle
      active={vimEnabled}
      className="vim-toggle"
      keepEditorFocus
      label={vimEnabled ? 'Disable Vim editing' : 'Enable Vim editing'}
      onToggle={onToggle}
    >
      VIM
    </StatusToggle>
  )
}
