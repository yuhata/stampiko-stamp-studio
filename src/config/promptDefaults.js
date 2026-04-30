// スタンプ生成プロンプトのデフォルト定義と学習関連の定数
//
// [2026-04-30] 参考画像+カラーパレット問題について
// 参考画像を添付した場合、Gemini が写真の色に引きずられてパレット指定を無視する問題を修正。
// 対処は二重防御:
//   1. このプロンプトテンプレートの COLOR セクションに「参考写真の色を使わない」旨を追記
//   2. API 側の buildContentParts()（LBS_Stamp_API/lib/stampImage.js）で参考画像ありの
//      場合は色制約プレフィックスをプロンプト先頭に自動挿入（最高優先度）
// コスト影響: 参考画像なし時はトークン数変化なし。参考画像ありの場合は API 側プレフィックスで
//   約+300トークン/リクエスト増加（~¥0.002/生成 程度、月100件で¥0.2未満）。

export const DEFAULT_PROMPT = `Japanese rubber stamp design for a location-based stamp collection app.
Category: Location Stamp

=== BACKGROUND (CRITICAL) ===
The background outside the stamp circle MUST be PURE WHITE (#FFFFFF).
NO texture, NO grain, NO off-white, NO shadow outside the circle.
The white area must be completely clean and uniform for easy transparency masking.

=== STAMP FORMAT (FIXED SIZE — DO NOT DEVIATE) ===
CIRCULAR ink stamp. The circle diameter MUST be EXACTLY 88–92% of the canvas height.
The circle MUST be centered both horizontally and vertically on the canvas.
The stamp circle MUST have a visible ink border/outline ring (2–4% of diameter thickness).
NO rectangular frames. NOT a postage stamp. Every generated stamp must have the same circle size.

=== INSIDE THE STAMP ===
Street View perspective of {SPOT_NAME}. Landmark silhouette fills ~45–55% of the circle.

=== INK TEXTURE ===
Subtle rubber-stamp ink effect. Gentle ink bleed at edges.

=== COLOR ===
Use 2–4 ink colors from: {PALETTE}.
Colors appear as absorbed ink, slightly muted. DO NOT use white inside.
IMPORTANT: If a reference photo was provided, IGNORE all colors in that photo.
Use ONLY the palette colors listed above, regardless of the reference image.

=== VISUAL STYLE ===
Flat graphic shapes, Showa-era retro. NO gradients, NO 3D, NO photorealism.
Image size: 1024x1024 pixels.`

// 学習ルールセクションの識別マーカー
export const LEARNED_RULES_HEADER = '=== LEARNED RULES (from NG log) ==='

// 学習ルールの最大件数（これ以上は頻度上位のみ適用）
export const MAX_LEARNED_RULES = 5

// 保護セクション: 学習ルールと矛盾しても上書きされない基本仕様
// これらのキーワードを含むルールが学習で追加されようとした場合、
// 既存のセクション指示を保護する注釈を付与する
export const PROTECTED_SECTIONS = [
  'STAMP FORMAT',   // 円形枠・形状の定義
  'BACKGROUND',     // 背景色の定義
]

// NG理由 → プロンプト追加ルールのマッピング
export const NG_TO_PROMPT_RULES = {
  'テキスト混入': 'CRITICAL: Absolutely NO text, letters, kanji, kana, numbers, dates, or labels ANYWHERE in the image.',
  '構図が偏っている': 'Center the main subject. Ensure balanced composition with breathing space on all sides.',
  '色が規格外': 'Use ONLY the specified palette colors. Do NOT introduce any colors outside the palette.',
  '透過品質が悪い': 'The area OUTSIDE the stamp circle must be PURE WHITE (#FFFFFF) with zero texture or grain.',
  'インクテクスチャ不足': 'Add visible rubber-stamp ink texture: slight unevenness, gentle ink bleed at edges, subtle pressure variation.',
  'デジタル感が強い': 'Avoid clean digital look. Emulate traditional woodblock/rubber stamp printing with organic imperfections.',
  'ランドマーク不明瞭': 'Make the landmark clearly recognizable. Show the actual architectural features of {SPOT_NAME}, not generic tower or building shapes.',
  '詰め込みすぎ': 'Keep the design simple with fewer elements inside the stamp circle. Maintain wide spacing between elements.',
  '写実的すぎる': 'Use FLAT graphic shapes only. NO gradients, NO 3D effects, NO photorealism, NO shading.',
}

// デザインオプション定数（BatchForm / StampModal 共用）
export const MOOD_OPTIONS = [
  { value: '', label: '指定なし' },
  { value: 'simple', label: 'シンプル', prompt: 'Minimalist design with clean lines and few details.' },
  { value: 'modern', label: 'モダン', prompt: 'Modern, stylish design with geometric shapes and bold lines.' },
  { value: 'traditional', label: '伝統的', prompt: 'Traditional Japanese woodblock print style with classic motifs.' },
  { value: 'cute', label: 'かわいい', prompt: 'Cute, friendly design with soft rounded shapes.' },
  { value: 'elegant', label: 'エレガント', prompt: 'Refined, elegant design with delicate linework and sophistication.' },
]

export const COLOR_COUNT_OPTIONS = [
  { value: '', label: '指定なし', prompt: '' },
  { value: 'mono', label: '単色', prompt: 'Use ONLY 1 ink color from the palette. Monochrome stamp.' },
  { value: '2color', label: '2色', prompt: 'Use exactly 2 ink colors from the palette.' },
  { value: '3color', label: '3色', prompt: 'Use exactly 3 ink colors from the palette.' },
]

export const ELEMENT_OPTIONS = [
  { value: 'building', label: '建物' },
  { value: 'landscape', label: '風景' },
  { value: 'animal', label: '動物' },
  { value: 'person', label: '人' },
  { value: 'food', label: '食べ物' },
  { value: 'nature', label: '自然' },
]

export const API_URL = 'https://stampiko-api.vercel.app'

/**
 * デザインオプションからプロンプト補足ブロックを構築
 */
export function buildDesignOptionsBlock({ mood, colorCount, elements }) {
  const lines = []
  const moodOpt = MOOD_OPTIONS.find(m => m.value === mood)
  if (moodOpt?.prompt) lines.push(moodOpt.prompt)
  const colorOpt = COLOR_COUNT_OPTIONS.find(c => c.value === colorCount)
  if (colorOpt?.prompt) lines.push(colorOpt.prompt)
  if (elements && elements.length > 0) {
    const labels = elements.map(e => ELEMENT_OPTIONS.find(o => o.value === e)?.label || e)
    lines.push(`Include these visual elements: ${labels.join(', ')}.`)
  }
  return lines.length > 0 ? `\n\n=== DESIGN OPTIONS ===\n${lines.join('\n')}` : ''
}

// localStorage キー
export const STORAGE_KEYS = {
  PROMPT: 'lbs-stamp-studio-prompt',
  NG_LOG: 'lbs-stamp-studio-ng-log',
}

/**
 * 現在のプロンプトから学習ルールセクションを除去し、ベースプロンプトを返す
 */
export function extractBasePrompt(currentPrompt) {
  const idx = currentPrompt.indexOf(LEARNED_RULES_HEADER)
  if (idx === -1) return currentPrompt.trim()
  return currentPrompt.substring(0, idx).trim()
}

/**
 * ベースプロンプトに学習ルールを付与した完成プロンプトを構築する
 * 既存のルールセクションは毎回上書き（追記ではなく置換）
 */
export function buildPromptWithRules(basePrompt, rules) {
  if (!rules || rules.length === 0) return basePrompt
  const limited = rules.slice(0, MAX_LEARNED_RULES)
  const rulesBlock = `\n\n=== ${LEARNED_RULES_HEADER.replace('=== ', '').replace(' ===', '')} ===\n${limited.map(r => `- ${r}`).join('\n')}\n\nIMPORTANT: The above rules are supplementary. The STAMP FORMAT and BACKGROUND sections above take priority.`
  return basePrompt + rulesBlock
}
