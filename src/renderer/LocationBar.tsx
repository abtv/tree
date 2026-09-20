import type { TreeNode } from '../domain/document'

export function LocationBar({
  path,
  currentParentId,
  onNavigate,
  alwaysOnTop,
  onToggleAlwaysOnTop,
}: {
  path: readonly TreeNode[]
  currentParentId: string | null
  onNavigate: (parentId: string | null) => void
  alwaysOnTop: boolean
  onToggleAlwaysOnTop: () => void
}): React.JSX.Element {
  return (
    <header className="location-bar" aria-label="Current location">
      <button aria-label="Top level" className="location-root" onClick={() => onNavigate(null)} type="button">
        <OutlineRootIcon />
      </button>
      {path.map((node) => (
        <span className="location-segment" key={node.id} style={{ flexShrink: node.text.length + 1 }}>
          <span className="location-separator">›</span>
          {node.id === currentParentId ? (
            <span className="location-current" title={node.text}>
              {node.text}
            </span>
          ) : (
            <button className="location-link" onClick={() => onNavigate(node.id)} title={node.text} type="button">
              {node.text}
            </button>
          )}
        </span>
      ))}
      <button
        aria-pressed={alwaysOnTop}
        aria-label={alwaysOnTop ? 'Unpin window from top' : 'Pin window on top'}
        className={alwaysOnTop ? 'always-on-top-toggle always-on-top-toggle-active' : 'always-on-top-toggle'}
        onClick={onToggleAlwaysOnTop}
        title={alwaysOnTop ? 'Unpin window from top' : 'Pin window on top'}
        type="button"
      >
        <PinIcon />
      </button>
    </header>
  )
}

function OutlineRootIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 6v5m0 0-5 5m5-5 5 5" />
      <circle cx="12" cy="5" r="2" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  )
}

function PinIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m14 3 7 7-2.2 2.2-2.1-2.1-3.6 3.6v4.2L11 20l-2.7-2.7H4.1l-1.2-1.2 5.1-5.1-2.1-2.1L8.1 6.7 14 3Z" />
      <path d="m11.8 12.2-5.5 5.5" />
    </svg>
  )
}
