export default function requireReleaseCredentials() {
  for (const name of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']) {
    if (!process.env[name]?.trim()) throw new Error(`Release requires ${name}`)
  }
}
