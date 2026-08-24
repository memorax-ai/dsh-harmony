import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

type Mode = 'official' | 'harmony'

interface StartupTiming {
  mode: Mode
  milliseconds: number
  harmony?: {
    prepareMs: number
    transformMs: number
    totalMs: number
    targetPackages: number
    targetFiles: number
  }
}

function requestedRuns(): number {
  const value = process.argv.find(argument => argument.startsWith('--runs='))?.slice('--runs='.length)
  const runs = value === undefined ? 5 : Number(value)
  if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer')
  return runs
}

function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve()
  return new Promise(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 5_000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

async function start(mode: Mode, home: string, harmonyBin: string): Promise<StartupTiming> {
  const command = mode === 'official' ? 'dsh' : process.execPath
  const args = mode === 'official'
    ? ['web', '--port', '0', '--no-open']
    : [harmonyBin, 'web', '--port', '0', '--no-open']
  const env: NodeJS.ProcessEnv = { ...process.env, DSH_HOME: home, NO_COLOR: '1' }
  delete env.DSH_HARMONY_ACTIVE
  delete env.DSH_HARMONY_PERF
  if (mode === 'harmony') env.DSH_HARMONY_PERF = '1'
  const child = spawn(command, args, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const started = performance.now()
  let output = ''
  try {
    const milliseconds = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`${mode} startup timed out:\n${output}`)), 30_000)
      const read = (chunk: Buffer): void => {
        output += chunk
        if (!output.includes('dsh web: http://127.0.0.1:')) return
        clearTimeout(timeout)
        resolve(performance.now() - started)
      }
      child.stdout!.on('data', read)
      child.stderr!.on('data', read)
      child.once('exit', code => {
        clearTimeout(timeout)
        reject(new Error(`${mode} startup exited ${code}:\n${output}`))
      })
    })
    const performanceRecord = [...output.matchAll(/dsh-harmony: performance (\{[^\n]+\})/g)]
      .map(match => JSON.parse(match[1]!) as StartupTiming['harmony'] & { operation?: string })
      .find(record => record.operation === 'startup')
    return {
      mode,
      milliseconds,
      ...(performanceRecord === undefined ? {} : { harmony: performanceRecord }),
    }
  } finally {
    await stop(child)
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}

function summary(values: StartupTiming[]): { medianMs: number; minMs: number; maxMs: number; samplesMs: number[] } {
  const samplesMs = values.map(value => Math.round(value.milliseconds * 100) / 100)
  return {
    medianMs: median(samplesMs),
    minMs: Math.min(...samplesMs),
    maxMs: Math.max(...samplesMs),
    samplesMs,
  }
}

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const harmonyBin = join(root, 'lib/bin.js')
const harmonyVersion = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version
const dshVersion = spawnSync('dsh', ['--version'], { encoding: 'utf8' }).stdout.trim()
const runs = requestedRuns()
const homes: Record<Mode, string> = {
  official: mkdtempSync(join(tmpdir(), 'dsh-official-benchmark-')),
  harmony: mkdtempSync(join(tmpdir(), 'dsh-harmony-benchmark-')),
}

try {
  const cold = {
    official: await start('official', homes.official, harmonyBin),
    harmony: await start('harmony', homes.harmony, harmonyBin),
  }
  const warm: Record<Mode, StartupTiming[]> = { official: [], harmony: [] }
  for (let index = 0; index < runs; index += 1) {
    const order: Mode[] = index % 2 === 0 ? ['harmony', 'official'] : ['official', 'harmony']
    for (const mode of order) warm[mode].push(await start(mode, homes[mode], harmonyBin))
  }
  const official = summary(warm.official)
  const harmony = summary(warm.harmony)
  const result = {
    node: process.version,
    dsh: dshVersion,
    harmony: harmonyVersion,
    runs,
    coldMs: {
      official: Math.round(cold.official.milliseconds * 100) / 100,
      harmony: Math.round(cold.harmony.milliseconds * 100) / 100,
    },
    warm: { official, harmony },
    overhead: {
      medianMs: Math.round((harmony.medianMs - official.medianMs) * 100) / 100,
      percent: Math.round((harmony.medianMs / official.medianMs - 1) * 10_000) / 100,
    },
    harmonyStartup: cold.harmony.harmony,
  }
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, undefined, 2)}\n`)
  } else {
    process.stdout.write([
      `DSH startup benchmark (${result.dsh}, Harmony ${result.harmony}, ${result.node})`,
      `cold: official ${result.coldMs.official.toFixed(2)} ms, Harmony ${result.coldMs.harmony.toFixed(2)} ms`,
      `warm median (${runs} runs): official ${official.medianMs.toFixed(2)} ms, Harmony ${harmony.medianMs.toFixed(2)} ms`,
      `Harmony overhead: ${result.overhead.medianMs.toFixed(2)} ms (${result.overhead.percent.toFixed(2)}%)`,
      `official samples: ${official.samplesMs.map(value => value.toFixed(2)).join(', ')} ms`,
      `Harmony samples: ${harmony.samplesMs.map(value => value.toFixed(2)).join(', ')} ms`,
      '',
    ].join('\n'))
  }
} finally {
  rmSync(homes.official, { recursive: true })
  rmSync(homes.harmony, { recursive: true })
}
