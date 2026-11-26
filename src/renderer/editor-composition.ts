/** A browser clear button can emit a plain input event and omit compositionend. */
export function isCommittedCompositionInput(event: Event): boolean {
  return event.type === 'input' && (event as Partial<InputEvent>).isComposing !== true
}

const composingFindInputs = new WeakSet<HTMLInputElement>()

/** Find prompts are separate surfaces. A removed prompt cannot keep the application locked. */
export const findPromptComposition = {
  owns: (target: EventTarget | null): boolean => target instanceof HTMLInputElement && composingFindInputs.has(target),
  start: (input: HTMLInputElement): void => {
    composingFindInputs.add(input)
  },
  end: (input: HTMLInputElement): void => {
    composingFindInputs.delete(input)
  },
}

/** One native composition belongs to an editor element, not the app or the node ID. */
export class EditorComposition {
  private active: { input: HTMLElement; initialText: string } | undefined

  public owns = (target: EventTarget | null): boolean => this.active !== undefined && this.active.input === target

  public start(input: HTMLElement, initialText: string): void {
    this.active = { input, initialText }
  }

  public initialText(input: HTMLElement): string | undefined {
    return this.active?.input === input ? this.active.initialText : undefined
  }

  public end(input: HTMLElement): void {
    if (this.active?.input === input) this.active = undefined
  }

  public releaseDetached(): void {
    if (this.active?.input.isConnected === false) this.active = undefined
  }
}
