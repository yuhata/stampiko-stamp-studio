#!/usr/bin/env node
/**
 * Firebase Emulator + Vite dev server + Playwright を一括起動する。
 *
 * Studio は本体と同じ Firebase プロジェクト (stampiko-e8be8) を使うが、
 * 別プロセスとして emulator を起動できるよう独立した firebase.json を持つ。
 *
 * フロー:
 *   1) Firebase Emulator (auth+firestore+storage) を起動 → 9099/8081/9199 待機
 *   2) Vite dev server を VITE_USE_EMULATOR=true で起動 → 5179 待機
 *   3) Playwright tests を実行
 *   4) 終了時に子プロセスをまとめて kill
 *
 * 前提:
 *   - firebase-tools がグローバルに入っていること（firebase --version）
 *   - Java（OpenJDK）が入っていること（brew install openjdk）
 */
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

const DEV_PORT = 5179
const EMULATOR_PORTS = [9099, 8081, 9199]
const TIMEOUT_MS = 60_000

const children = []

function startProcess(cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    stdio: 'inherit',
    shell: false,
    ...opts,
  })
  children.push(child)
  child.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`[run-e2e] ${cmd} exited with code ${code} (signal=${signal})`)
    }
  })
  return child
}

async function waitForPort(port, host = '127.0.0.1', timeoutMs = TIMEOUT_MS) {
  const net = await import('node:net')
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const sock = net.createConnection({ port, host }, () => {
        sock.end()
        resolve(true)
      })
      sock.on('error', () => resolve(false))
    })
    if (ok) return true
    await delay(500)
  }
  throw new Error(`Timeout waiting for ${host}:${port}`)
}

function cleanup() {
  for (const child of children) {
    if (!child.killed) {
      try { process.kill(-child.pid, 'SIGTERM') } catch { /* ignore */ }
      try { child.kill('SIGTERM') } catch { /* ignore */ }
    }
  }
}

process.on('SIGINT', () => { cleanup(); process.exit(130) })
process.on('SIGTERM', () => { cleanup(); process.exit(143) })

async function main() {
  console.log('[run-e2e] Starting Firebase Emulator (auth, firestore, storage) …')
  startProcess('firebase', ['emulators:start', '--only', 'auth,firestore,storage'], {
    cwd: REPO_ROOT,
    detached: true,
  })

  for (const port of EMULATOR_PORTS) {
    await waitForPort(port)
    console.log(`[run-e2e] Emulator ready on :${port}`)
  }

  console.log('[run-e2e] Starting Vite dev server (VITE_USE_EMULATOR=true) …')
  startProcess('npm', ['run', 'dev', '--', '--port', String(DEV_PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: REPO_ROOT,
    detached: true,
    env: {
      ...process.env,
      VITE_USE_EMULATOR: 'true',
    },
  })
  await waitForPort(DEV_PORT)
  console.log(`[run-e2e] Dev server ready on :${DEV_PORT}`)

  console.log('[run-e2e] Running Playwright tests …')
  const playwright = spawn('npx', ['playwright', 'test', ...process.argv.slice(2)], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      E2E_BASE_URL: `http://localhost:${DEV_PORT}/stampiko-stamp-studio/`,
      VITE_USE_EMULATOR: 'true',
    },
  })

  const code = await new Promise((resolve) => playwright.on('exit', resolve))
  cleanup()
  process.exit(code ?? 0)
}

main().catch((err) => {
  console.error('[run-e2e] Fatal:', err)
  cleanup()
  process.exit(1)
})
