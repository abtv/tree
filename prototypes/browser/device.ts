/** iPadOS desktop browsing reports a Mac identity with multi-touch support. */
export function isIPhoneOrIPad(device: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>): boolean {
  return /iPhone|iPad/i.test(device.userAgent) || (device.platform === 'MacIntel' && device.maxTouchPoints > 1)
}
