import { useEffect, useState } from 'react'

export function useLeftCommandKey(): boolean {
  const [pressed, setPressed] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'MetaLeft') setPressed(true)
    }
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'MetaLeft') setPressed(false)
    }
    const onBlur = (): void => setPressed(false)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return pressed
}
