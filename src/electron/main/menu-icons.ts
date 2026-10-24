import type { NativeImage } from 'electron'

export const menuSymbols = {
  tree: 'point.3.connected.trianglepath.dotted',
  agenda: 'calendar',
  export: 'square.and.arrow.up',
  import: 'square.and.arrow.down',
} as const

export type MenuIcons = Record<keyof typeof menuSymbols, NativeImage>

export function createMenuIcons(createSymbol: (name: string) => NativeImage): MenuIcons {
  return {
    tree: createSymbol(menuSymbols.tree),
    agenda: createSymbol(menuSymbols.agenda),
    export: createSymbol(menuSymbols.export),
    import: createSymbol(menuSymbols.import),
  }
}
