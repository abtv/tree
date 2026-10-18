export interface ReleaseFile {
  path: string
  sha256: string
  size: number
}
export interface ReleaseIdentity {
  sourceRepository: string
  sourceSha: string
  sourceRunId: string
  sourceRunAttempt: number
}
export type Manifest = ReleaseIdentity & { files: ReleaseFile[] } & (
    { schema: 1; assetGenerations?: never } | { schema: 2; assetGenerations: string[][] }
  )
export type CurrentManifest = Extract<Manifest, { schema: 2 }>
export interface ApiOptions {
  token?: string | undefined
  method?: string
  body?: unknown
}
export type Request = (path: string, options?: ApiOptions) => Promise<unknown>
export interface ApiError extends Error {
  status?: number
  workflowWriteDenied?: boolean
}
export interface Reference {
  object: { sha: string }
}
export interface Commit {
  tree: { sha: string }
}
export interface TreeEntry {
  path: string
  type: string
  mode: string
  sha: string
  size: number
}
export interface Tree {
  truncated?: boolean
  tree: TreeEntry[]
}
export interface Blob {
  encoding: string
  size: number
  content: string
}
export interface Sha {
  sha: string
}
export interface WorkflowRun {
  id: number
  repository: { full_name: string }
  path: string
  event: string
  head_branch: string
  head_sha: string
  run_attempt: number
  status: string
  conclusion: string | null
}
export interface Job {
  name: string
  status: string
  conclusion: string
}
export type CommandRunner = (
  command: string,
  args: string[],
  options: import('node:child_process').ExecFileSyncOptions,
) => unknown
