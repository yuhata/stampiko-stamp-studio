// テンプレートスタンプ用 Gemini プロンプト定義
// BatchForm の DEFAULT_PROMPT と同等の詳細度を持ちつつ、テンプレ特有の要件を反映：
//  - POI名テキスト合成用の下部空白を厳守
//  - 単色固定（パレット不使用、category.color のみ）
//  - スポット名・位置情報なし（テンプレはカテゴリ毎の共通意匠）

// カテゴリ → illustration 記述（{ILLUSTRATION} プレースホルダに差し込まれる）
export const TEMPLATE_ILLUSTRATIONS = {
  // 本格9（既存 scripts/regenerate-templates-nippon.mjs と同じテキスト）
  shrine:      'Torii gate with path and pine trees',
  temple:      '3-story pagoda with garden element',
  station:     'Station building with clock tower and short tracks',
  castle:      'Japanese castle with stone walls and moat',
  lighthouse:  'Lighthouse with light beams and seagulls, no waves',
  rest_area:   'Mountains, rustic building, road',
  onsen:       'Steam lines, hot spring bath, rocks, bamboo fence',
  museum:      'Classical building with columns and art palette',
  zoo:         'Elephant, giraffe, penguin, trees, fence',

  // heritage + 新規6（2026-04-24 初定義）
  heritage:          'Traditional wooden storehouse (kura) with tiled roof and stone foundation',
  historic_building: 'Meiji-era red-brick Western building with arched windows and dormers',
  historic_site:     'Stone monument or burial mound with a single aged pine tree',
  theater:           'Stage curtains drawn open with spotlight beams and classical facade',
  park_garden:       'Japanese garden with arched bridge, pond, stepping stones, and pine tree',
  sightseeing_spot:  'Observation tower or scenic cliff viewpoint with distant mountains',
  church:            'Gothic church with tall steeple, cross, and rose window',
}

/**
 * テンプレート専用デフォルトプロンプト
 * BatchForm の DEFAULT_PROMPT を以下の方針で改変:
 *  - {SPOT_NAME}, {PALETTE} プレースホルダを撤去
 *  - {CATEGORY}, {COLOR}, {ILLUSTRATION} を導入
 *  - INSIDE THE STAMP を LAYOUT に変更し、POI名合成用の下部空白を厳守
 *  - 単色指定に変更
 */
export const DEFAULT_TEMPLATE_PROMPT = `Japanese rubber stamp design for a location-based stamp collection app.
Category: {CATEGORY}

=== BACKGROUND (CRITICAL) ===
The background outside the stamp circle MUST be PURE WHITE (#FFFFFF).
NO texture, NO grain, NO off-white, NO shadow outside the circle.
The white area must be completely clean and uniform for easy transparency masking.

=== STAMP FORMAT (FIXED SIZE — DO NOT DEVIATE) ===
CIRCULAR ink stamp. The circle diameter MUST be EXACTLY 88–92% of the canvas height.
The circle MUST be centered both horizontally and vertically on the canvas.
The stamp circle MUST have a visible ink border/outline ring (2–4% of diameter thickness).
Double concentric border rings preferred (outer ring + inner ring with generous margin).
Image size: 1024x1024 pixels.
NO rectangular frames. NOT a postage stamp.

=== LAYOUT (CRITICAL for text composition) ===
This is a TEMPLATE stamp. A location name (Japanese text) will be composited onto the
bottom of the circle LATER by the server. The illustration MUST leave the bottom area blank.
- Top 70–75% of the inner circle: ILLUSTRATION area (see ILLUSTRATION section below).
- Bottom 25–30% of the inner circle: MUST BE COMPLETELY BLANK/EMPTY (no ink, no pattern, no lines).
The blank bottom area is reserved for later text overlay composition.

=== ILLUSTRATION ===
{ILLUSTRATION}
Silhouette fills ~45–55% of the inner circle (top portion only).

=== INK ===
Single ink color: {COLOR} on pure white (#FFFFFF).
Rubber-stamp ink texture with gentle, uneven edges. Slight ink bleed.
Colors appear slightly absorbed/muted, like real rubber stamp ink.
Do NOT use white inside the illustration area (except intentional cutouts within the silhouette).
IMPORTANT: If a reference photo was provided, IGNORE all colors in that photo.
Use ONLY the ink color ({COLOR}) specified above, regardless of the reference image.

=== VISUAL STYLE ===
Flat graphic shapes, Showa-era retro. Geometric simplification.
NO gradients, NO 3D, NO photorealism, NO shading, NO lighting effects.

=== RULES ===
- NO text, NO letters, NO numbers ANYWHERE
- Bottom 25-30% of inner circle MUST remain BLANK for text composition
- The circle border must be visible, continuous, and evenly weighted
- NO rectangular frame around the outer canvas`

/**
 * テンプレート用 Gemini プロンプト構築
 *
 * @param {object} args
 * @param {string} args.categoryId - カテゴリID（例: 'historic_building'）
 * @param {string} args.color - アクセントカラー（例: '#8B4513'）
 * @param {string} args.illustration - イラスト記述（TEMPLATE_ILLUSTRATIONSから or ユーザー編集）
 * @param {string} [args.template] - プロンプトテンプレ（デフォルト: DEFAULT_TEMPLATE_PROMPT）
 */
export function buildTemplatePrompt({ categoryId, color, illustration, template = DEFAULT_TEMPLATE_PROMPT }) {
  return template
    .replace(/\{CATEGORY\}/g, categoryId)
    .replace(/\{COLOR\}/g, color)
    .replace(/\{ILLUSTRATION\}/g, illustration)
}
