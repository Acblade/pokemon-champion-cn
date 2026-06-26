import { spawnSync } from 'node:child_process'

const env = {
  ...process.env,
  CHAMPS_USAGE_SOURCE: process.env.CHAMPS_USAGE_SOURCE || 'gamewith',
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? 'pipe' : 'inherit',
    shell: process.platform === 'win32',
    env: options.env ?? env,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    const detail = options.capture ? `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() : ''
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `\n${detail}` : ''}`)
  }
  return result.stdout ?? ''
}

function hasGeneratedUsageChanges() {
  const output = run('git', ['status', '--short', '--', 'src/generated/usage-datasets.json', 'src/generated/pikalytics-usage.json'], { capture: true })
  return output.trim().length > 0
}

function main() {
  run('npm', ['run', 'update-usage'])
  run('npm', ['run', 'build'], { env: { ...env, GITHUB_PAGES: 'true' } })
  run('npm', ['run', 'lint'])
  run('npx', ['tsx', 'scripts/test-champions-calc.ts'])

  if (!hasGeneratedUsageChanges()) {
    console.log('No usage data changes to commit.')
    return
  }

  const today = new Date().toISOString().slice(0, 10)
  run('git', ['add', 'src/generated/usage-datasets.json', 'src/generated/pikalytics-usage.json'])
  run('git', ['commit', '-m', `chore: sync usage and trainer rankings ${today}`])
  run('git', ['push'])
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
