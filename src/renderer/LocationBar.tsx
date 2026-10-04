import type { TreeNode } from '../domain/document'

export function LocationBar({
  path,
  currentParentId,
  onNavigate,
  dropParentId,
}: {
  path: readonly TreeNode[]
  currentParentId: string | null
  onNavigate: (parentId: string | null) => void
  dropParentId?: string | null | undefined
}): React.JSX.Element {
  return (
    <header className="location-bar" aria-label="Current location">
      <button
        aria-label="Top level"
        data-breadcrumb-id=""
        className={`location-root${dropParentId === null ? ' location-drop-target' : ''}`}
        onClick={() => onNavigate(null)}
        type="button"
      >
        <OutlineRootIcon />
      </button>
      {path.map((node) => (
        <span
          data-breadcrumb-id={node.id}
          className={`location-segment${dropParentId === node.id ? ' location-drop-target' : ''}`}
          key={node.id}
          style={{ flexShrink: node.text.length + 1 }}
        >
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
