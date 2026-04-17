// Firestore ルール更新スクリプト (ver2)
// studio_stamps/{stampId} コレクションに read/write auth 必須を追加
//
// 実行: node scripts/update-firestore-rules.mjs

import fs from 'fs'
import os from 'os'
import path from 'path'

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
  return (await r.json()).access_token
}

const NEW_RULES = `rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ── ユーザーデータ ──
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // ── スポット・グループ・スタンプ・エリア（公開読み取り）──
    match /spots/{spotId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
    match /groups/{groupId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
    match /stamps/{stampId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    match /areas/{areaId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
    match /spot_trivia/{spotId} {
      allow read: if request.auth != null;
      allow write: if false;
    }

    // ── キャプチャログ ──
    match /captures/{captureId} {
      allow read: if request.auth != null
                  && resource.data.user_id == request.auth.uid;
      allow create: if false;
      allow update, delete: if false;
    }

    // ── イベントログ（ベータ計測）──
    match /events/{eventId} {
      allow create: if request.auth != null
                    && request.resource.data.user_id == request.auth.uid;
      allow read, update, delete: if false;
    }

    // ── UGC投稿 ──
    match /ugc_submissions/{submissionId} {
      allow read: if request.auth != null
                  && resource.data.submitter_id == request.auth.uid;
      allow create: if request.auth != null;
      allow update, delete: if false;
    }

    // ── ウェイトリスト ──
    match /waitlist/{docId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if false;
    }

    // ── Stamp Studio 設定（areaConfig / criteria / ngReasons 等）──
    match /studio_settings/{docId} {
      allow read, write: if request.auth != null;
    }

    // ── Stamp Studio カスタムスタンプ（レガシー。移行期間中のみ保持）──
    match /studio_custom_stamps/{stampId} {
      allow read, write: if request.auth != null;
    }

    // ── Stamp Studio スタンプ統合コレクション（ver2以降）──
    match /studio_stamps/{stampId} {
      allow read, write: if request.auth != null;
    }

    // ── 管理者（Admin SDKのみ）──
    match /admins/{email} {
      allow read, write: if false;
    }
  }
}
`

async function main() {
  const token = await getToken()

  console.log('[rules] 新規ruleset作成...')
  const createResp = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: {
          files: [{ name: 'firestore.rules', content: NEW_RULES }],
        },
      }),
    }
  )
  const createJson = await createResp.json()
  if (!createResp.ok) { console.error('create failed:', createJson); process.exit(1) }
  const rulesetName = createJson.name
  console.log(`[rules] ruleset作成: ${rulesetName}`)

  console.log('[rules] release更新...')
  const releaseResp = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`,
    {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        release: {
          name: `projects/${PROJECT}/releases/cloud.firestore`,
          rulesetName,
        },
      }),
    }
  )
  const releaseJson = await releaseResp.json()
  if (!releaseResp.ok) { console.error('release failed:', releaseJson); process.exit(1) }
  console.log('[rules] ✓ release更新完了')
  console.log(releaseJson)
}

main().catch(err => { console.error('[rules] FATAL:', err); process.exit(1) })
