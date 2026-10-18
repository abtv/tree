/** iPadOS desktop browsing reports a Mac identity with multi-touch support. */
export function isIPhoneOrIPad(device: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>): boolean {
  return /iPhone|iPad/i.test(device.userAgent) || (device.platform === 'MacIntel' && device.maxTouchPoints > 1)
}

/** An unavailable platform preserves the existing Apple shortcut mapping. */
export function isApplePlatform(device: Pick<Navigator, 'userAgent' | 'platform'>): boolean {
  return (
    !device.platform || /^(Mac|iPhone|iPad|iPod)/i.test(device.platform) || /iPhone|iPad|iPod/i.test(device.userAgent)
  )
}
