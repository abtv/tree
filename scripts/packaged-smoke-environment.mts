export function packagedSmokeEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {}
  for (const name of ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', '__CF_USER_TEXT_ENCODING']) {
    if (source[name] !== undefined) environment[name] = source[name]
  }
  return environment
}
