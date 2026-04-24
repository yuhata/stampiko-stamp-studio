// テンプレートスタンプ用 Gemini プロンプト定義
// 既存の scripts/regenerate-templates-nippon.mjs と同じ構造で、
// 本格9カテゴリ（shrine〜zoo）の描画実績を踏襲。新規7カテゴリはここで初定義。

// カテゴリ → illustration 記述（Gemini プロンプトの ILLUSTRATION セクション）
export const TEMPLATE_ILLUSTRATIONS = {
  // 本格9（既存 regenerate-templates-nippon.mjs と同じ）
  shrine:      'Torii gate with path and pine trees',
  temple:      '3-story pagoda with garden element',
  station:     'Station building with clock tower and short tracks',
  castle:      'Japanese castle with stone walls and moat',
  lighthouse:  'Lighthouse with light beams and seagulls, no waves',
  rest_area:   'Mountains, rustic building, road',
  onsen:       'Steam lines, hot spring bath, rocks, bamboo fence',
  museum:      'Classical building with columns and art palette',
  zoo:         'Elephant, giraffe, penguin, trees, fence',

  // heritage + 新規6（今回初定義）
  heritage:          'Traditional wooden storehouse (kura) with tiled roof and stone foundation',
  historic_building: 'Meiji-era red-brick Western building with arched windows and dormers',
  historic_site:     'Stone monument or burial mound with a single aged pine tree',
  theater:           'Stage curtains drawn open with spotlight beams and classical facade',
  park_garden:       'Japanese garden with arched bridge, pond, stepping stones, and pine tree',
  sightseeing_spot:  'Observation tower or scenic cliff viewpoint with distant mountains',
  church:            'Gothic church with tall steeple, cross, and rose window',
}

/**
 * テンプレート用 Gemini プロンプト構築
 * 既存 scripts/regenerate-templates-nippon.mjs の buildPrompt と同一仕様
 */
export function buildTemplatePrompt(categoryId, color, illustrationOverride = null) {
  const illustration = illustrationOverride || TEMPLATE_ILLUSTRATIONS[categoryId] || 'Simple iconic landmark silhouette'
  return `Japanese rubber stamp design for a location-based stamp collection app.
Category: ${categoryId}

=== LAYOUT ===
Top 70-75%: Illustration. Bottom 25-30%: Empty for text overlay.

=== STAMP FORMAT ===
- CIRCULAR stamp, double concentric border rings with generous inner margin
- Single ink color: ${color} on pure white (#FFFFFF)
- Rubber stamp ink texture (slight unevenness)
- 1024x1024 pixels

=== ILLUSTRATION ===
${illustration}

=== RULES ===
- NO text, NO letters, NO numbers
- Flat, Showa-era retro style
- Bottom 25% MUST be blank`
}
