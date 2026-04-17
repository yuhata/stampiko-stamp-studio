// 移行前バックアップスクリプト
// studio_settings/global と studio_custom_stamps/* を全量JSON保存
// ロールバック時の復元ソースとする
//
// 出力: scripts/backups/YYYY-MM-DD-HHMMSS/
//   - studio_settings_global.json
//   - studio_custom_stamps.json  (配列形式で全ドキュメント)
//   - meta.json (件数・タイムスタンプ)
//
// 実行: node scripts/backup-before-migration.mjs

import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = 'stampiko-e8be8'
const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'))

async function getToken() {
  const body = new URLSearchParams({
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    refresh_token: cfg.tokens.refresh_token,
    grant_type: 'refresh_token',
  })
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })
  const j = await r.json()
  if (!j.access_token) throw new Error('refresh failed: ' + JSON.stringify(j))
  return j.access_token
}

async function fetchDoc(token, docPath) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}`
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } })
  if (!r.ok) throw new Error(`fetch ${docPath} failed: ${r.status}`)
  return r.json()
}

async function fetchAllDocs(token, collectionPath) {
  const all = []
  let nextToken = null
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collectionPath}?pageSize=300${nextToken ? `&pageToken=${nextToken}` : ''}`
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } })
    if (!r.ok) throw new Error(`list ${collectionPath} failed: ${r.status}`)
    const j = await r.json()
    all.push(...(j.documents || []))
    nextToken = j.nextPageToken
  } while (nextToken)
  return all
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupDir = path.join(__dirname, 'backups', timestamp)
  fs.mkdirSync(backupDir, { recursive: true })
  console.log(`[backup] 出力先: ${backupDir}`)

  const token = await getToken()

  console.log('[backup] studio_settings/global 取得...')
  const settings = await fetchDoc(token, 'studio_settings/global')
  fs.writeFileSync(path.join(backupDir, 'studio_settings_global.json'), JSON.stringify(settings, null, 2))
  const fields = settings.fields || {}
  const settingsStats = {
    stampOverrides: Object.keys(fields.stampOverrides?.mapValue?.fields || {}).length,
    areaConfig: Object.keys(fields.areaConfig?.mapValue?.fields || {}).length,
    ngReasons: (fields.ngReasons?.arrayValue?.values || []).length,
    criteria: (fields.criteria?.arrayValue?.values || []).length,
    customStamps: (fields.customStamps?.arrayValue?.values || []).length,
  }
  console.log('[backup]   件数:', settingsStats)

  console.log('[backup] studio_custom_stamps/* 取得...')
  const customStamps = await fetchAllDocs(token, 'studio_custom_stamps')
  fs.writeFileSync(path.join(backupDir, 'studio_custom_stamps.json'), JSON.stringify(customStamps, null, 2))
  console.log(`[backup]   件数: ${customStamps.length}`)

  const meta = {
    timestamp: new Date().toISOString(),
    project: PROJECT,
    settings: settingsStats,
    customStampsCount: customStamps.length,
    note: 'ver2 migration backup - studio_stamps 統一前',
  }
  fs.writeFileSync(path.join(backupDir, 'meta.json'), JSON.stringify(meta, null, 2))
  console.log('[backup] 完了')
  console.log('[backup] meta:', meta)
  console.log(`\n[backup] ロールバック時: scripts/restore-from-backup.mjs ${backupDir}`)
}

main().catch(err => { console.error('[backup] FATAL:', err); process.exit(1) })
