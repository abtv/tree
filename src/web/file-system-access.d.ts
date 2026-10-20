// File System Access picker/permission members not yet in TypeScript's DOM library.
interface FileSystemHandle {
  queryPermission(options?: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission(options?: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

interface Window {
  showDirectoryPicker?: (options: { mode: 'read' | 'readwrite'; id?: string }) => Promise<FileSystemDirectoryHandle>
}
