/**
 * テンプレートスタンプ合成パイプライン
 * カテゴリ共通デザイン + 固有名テキストを合成してスタンプ画像を生成
 *
 * 使い方:
 *   node scripts/generate-template-stamps.mjs                    # テスト（サンプル10件）
 *   node scripts/generate-template-stamps.mjs public/poi/tokyo.json   # 指定POIファイル
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve('public/template-stamps');

// カテゴリ別テンプレート定義
const TEMPLATES = {
  shrine: {
    label: '神社',
    bgColor: '#FFFFFF',
    stampColor: '#C0392B',
    accentColor: '#8B4513',
    icon: (cx, cy, r) => `
      <!-- 鳥居 -->
      <rect x="${cx - r * 0.5}" y="${cy - r * 0.35}" width="${r}" height="${r * 0.08}" rx="2" fill="currentColor" opacity="0.9"/>
      <rect x="${cx - r * 0.55}" y="${cy - r * 0.28}" width="${r * 1.1}" height="${r * 0.06}" rx="2" fill="currentColor" opacity="0.85"/>
      <rect x="${cx - r * 0.4}" y="${cy - r * 0.28}" width="${r * 0.08}" height="${r * 0.55}" fill="currentColor" opacity="0.8"/>
      <rect x="${cx + r * 0.32}" y="${cy - r * 0.28}" width="${r * 0.08}" height="${r * 0.55}" fill="currentColor" opacity="0.8"/>
      <!-- 階段 -->
      <rect x="${cx - r * 0.3}" y="${cy + r * 0.28}" width="${r * 0.6}" height="${r * 0.04}" fill="currentColor" opacity="0.4"/>
      <rect x="${cx - r * 0.25}" y="${cy + r * 0.33}" width="${r * 0.5}" height="${r * 0.04}" fill="currentColor" opacity="0.35"/>
    `,
  },
  temple: {
    label: '寺院',
    bgColor: '#FFFFFF',
    stampColor: '#4E342E',
    accentColor: '#1B5E20',
    icon: (cx, cy, r) => `
      <!-- 屋根 -->
      <polygon points="${cx},${cy - r * 0.4} ${cx - r * 0.45},${cy - r * 0.1} ${cx + r * 0.45},${cy - r * 0.1}" fill="currentColor" opacity="0.85"/>
      <polygon points="${cx},${cy - r * 0.55} ${cx - r * 0.15},${cy - r * 0.4} ${cx + r * 0.15},${cy - r * 0.4}" fill="currentColor" opacity="0.9"/>
      <!-- 本体 -->
      <rect x="${cx - r * 0.35}" y="${cy - r * 0.1}" width="${r * 0.7}" height="${r * 0.4}" fill="currentColor" opacity="0.75"/>
      <!-- 柱 -->
      <rect x="${cx - r * 0.28}" y="${cy - r * 0.05}" width="${r * 0.06}" height="${r * 0.35}" fill="white" opacity="0.3"/>
      <rect x="${cx + r * 0.22}" y="${cy - r * 0.05}" width="${r * 0.06}" height="${r * 0.35}" fill="white" opacity="0.3"/>
      <!-- 地面 -->
      <ellipse cx="${cx}" cy="${cy + r * 0.35}" rx="${r * 0.5}" ry="${r * 0.06}" fill="currentColor" opacity="0.3"/>
    `,
  },
  station: {
    label: '駅',
    bgColor: '#FFFFFF',
    stampColor: '#1565C0',
    accentColor: '#37474F',
    icon: (cx, cy, r) => `
      <!-- 駅舎 -->
      <rect x="${cx - r * 0.4}" y="${cy - r * 0.15}" width="${r * 0.8}" height="${r * 0.45}" rx="3" fill="currentColor" opacity="0.8"/>
      <!-- 屋根 -->
      <polygon points="${cx - r * 0.45},${cy - r * 0.15} ${cx},${cy - r * 0.4} ${cx + r * 0.45},${cy - r * 0.15}" fill="currentColor" opacity="0.9"/>
      <!-- 窓 -->
      <rect x="${cx - r * 0.25}" y="${cy - r * 0.05}" width="${r * 0.15}" height="${r * 0.15}" rx="2" fill="white" opacity="0.4"/>
      <rect x="${cx + r * 0.1}" y="${cy - r * 0.05}" width="${r * 0.15}" height="${r * 0.15}" rx="2" fill="white" opacity="0.4"/>
      <!-- 入口 -->
      <rect x="${cx - r * 0.08}" y="${cy + r * 0.05}" width="${r * 0.16}" height="${r * 0.25}" rx="2" fill="white" opacity="0.3"/>
      <!-- 線路 -->
      <line x1="${cx - r * 0.5}" y1="${cy + r * 0.35}" x2="${cx + r * 0.5}" y2="${cy + r * 0.35}" stroke="currentColor" stroke-width="3" opacity="0.5"/>
    `,
  },
  castle: {
    label: '城',
    bgColor: '#FFFFFF',
    stampColor: '#37474F',
    accentColor: '#263238',
    icon: (cx, cy, r) => `
      <!-- 天守閣 -->
      <polygon points="${cx},${cy - r * 0.5} ${cx - r * 0.2},${cy - r * 0.25} ${cx + r * 0.2},${cy - r * 0.25}" fill="currentColor" opacity="0.9"/>
      <rect x="${cx - r * 0.25}" y="${cy - r * 0.25}" width="${r * 0.5}" height="${r * 0.2}" fill="currentColor" opacity="0.85"/>
      <polygon points="${cx - r * 0.3},${cy - r * 0.05} ${cx - r * 0.15},${cy - r * 0.25} ${cx + r * 0.15},${cy - r * 0.25} ${cx + r * 0.3},${cy - r * 0.05}" fill="currentColor" opacity="0.8"/>
      <!-- 石垣 -->
      <polygon points="${cx - r * 0.45},${cy + r * 0.35} ${cx - r * 0.3},${cy - r * 0.05} ${cx + r * 0.3},${cy - r * 0.05} ${cx + r * 0.45},${cy + r * 0.35}" fill="currentColor" opacity="0.6"/>
    `,
  },
  lighthouse: {
    label: '灯台',
    bgColor: '#FFFFFF',
    stampColor: '#0D47A1',
    accentColor: '#01579B',
    icon: (cx, cy, r) => `
      <!-- 灯台本体 -->
      <polygon points="${cx - r * 0.1},${cy + r * 0.3} ${cx - r * 0.15},${cy - r * 0.2} ${cx + r * 0.15},${cy - r * 0.2} ${cx + r * 0.1},${cy + r * 0.3}" fill="currentColor" opacity="0.85"/>
      <!-- ライト部分 -->
      <circle cx="${cx}" cy="${cy - r * 0.3}" r="${r * 0.12}" fill="currentColor" opacity="0.9"/>
      <circle cx="${cx}" cy="${cy - r * 0.3}" r="${r * 0.07}" fill="white" opacity="0.5"/>
      <!-- 光線 -->
      <line x1="${cx - r * 0.35}" y1="${cy - r * 0.45}" x2="${cx - r * 0.12}" y2="${cy - r * 0.32}" stroke="currentColor" stroke-width="2" opacity="0.3"/>
      <line x1="${cx + r * 0.35}" y1="${cy - r * 0.45}" x2="${cx + r * 0.12}" y2="${cy - r * 0.32}" stroke="currentColor" stroke-width="2" opacity="0.3"/>
      <!-- 波 -->
      <path d="M${cx - r * 0.5},${cy + r * 0.35} Q${cx - r * 0.25},${cy + r * 0.28} ${cx},${cy + r * 0.35} Q${cx + r * 0.25},${cy + r * 0.42} ${cx + r * 0.5},${cy + r * 0.35}" fill="none" stroke="currentColor" stroke-width="2" opacity="0.35"/>
    `,
  },
  rest_area: {
    label: '道の駅',
    bgColor: '#FFFFFF',
    stampColor: '#2E7D32',
    accentColor: '#1B5E20',
    icon: (cx, cy, r) => `
      <!-- 建物 -->
      <rect x="${cx - r * 0.4}" y="${cy - r * 0.1}" width="${r * 0.8}" height="${r * 0.35}" rx="3" fill="currentColor" opacity="0.8"/>
      <polygon points="${cx - r * 0.45},${cy - r * 0.1} ${cx},${cy - r * 0.35} ${cx + r * 0.45},${cy - r * 0.1}" fill="currentColor" opacity="0.85"/>
      <!-- 道路 -->
      <rect x="${cx - r * 0.5}" y="${cy + r * 0.3}" width="${r}" height="${r * 0.08}" rx="2" fill="currentColor" opacity="0.4"/>
      <!-- P -->
      <text x="${cx}" y="${cy + r * 0.05}" text-anchor="middle" font-size="${r * 0.25}" fill="white" opacity="0.5" font-weight="bold">P</text>
    `,
  },
  onsen: {
    label: '温泉',
    bgColor: '#FFFFFF',
    stampColor: '#E65100',
    accentColor: '#BF360C',
    icon: (cx, cy, r) => `
      <!-- 湯船 -->
      <ellipse cx="${cx}" cy="${cy + r * 0.15}" rx="${r * 0.4}" ry="${r * 0.15}" fill="currentColor" opacity="0.7"/>
      <rect x="${cx - r * 0.4}" y="${cy}" width="${r * 0.8}" height="${r * 0.15}" fill="currentColor" opacity="0.7"/>
      <!-- 湯気 -->
      <path d="M${cx - r * 0.15},${cy - r * 0.1} Q${cx - r * 0.2},${cy - r * 0.3} ${cx - r * 0.1},${cy - r * 0.45}" fill="none" stroke="currentColor" stroke-width="3" opacity="0.4"/>
      <path d="M${cx + r * 0.05},${cy - r * 0.1} Q${cx},${cy - r * 0.35} ${cx + r * 0.1},${cy - r * 0.5}" fill="none" stroke="currentColor" stroke-width="3" opacity="0.35"/>
      <path d="M${cx + r * 0.2},${cy - r * 0.1} Q${cx + r * 0.25},${cy - r * 0.25} ${cx + r * 0.18},${cy - r * 0.4}" fill="none" stroke="currentColor" stroke-width="3" opacity="0.3"/>
    `,
  },
  museum: {
    label: '美術館',
    bgColor: '#FFFFFF',
    stampColor: '#6A1B9A',
    accentColor: '#4A148C',
    icon: (cx, cy, r) => `
      <!-- 三角屋根 -->
      <polygon points="${cx},${cy - r * 0.45} ${cx - r * 0.45},${cy - r * 0.15} ${cx + r * 0.45},${cy - r * 0.15}" fill="currentColor" opacity="0.85"/>
      <!-- 本体 -->
      <rect x="${cx - r * 0.4}" y="${cy - r * 0.15}" width="${r * 0.8}" height="${r * 0.4}" fill="currentColor" opacity="0.75"/>
      <!-- 柱 -->
      <rect x="${cx - r * 0.3}" y="${cy - r * 0.15}" width="${r * 0.06}" height="${r * 0.4}" fill="white" opacity="0.25"/>
      <rect x="${cx - r * 0.1}" y="${cy - r * 0.15}" width="${r * 0.06}" height="${r * 0.4}" fill="white" opacity="0.25"/>
      <rect x="${cx + r * 0.1}" y="${cy - r * 0.15}" width="${r * 0.06}" height="${r * 0.4}" fill="white" opacity="0.25"/>
      <rect x="${cx + r * 0.25}" y="${cy - r * 0.15}" width="${r * 0.06}" height="${r * 0.4}" fill="white" opacity="0.25"/>
      <!-- 階段 -->
      <rect x="${cx - r * 0.35}" y="${cy + r * 0.25}" width="${r * 0.7}" height="${r * 0.05}" fill="currentColor" opacity="0.5"/>
    `,
  },
  zoo: {
    label: '動物園',
    bgColor: '#FFFFFF',
    stampColor: '#2E7D32',
    accentColor: '#1B5E20',
    icon: (cx, cy, r) => `
      <!-- 木 -->
      <circle cx="${cx - r * 0.25}" cy="${cy - r * 0.2}" r="${r * 0.2}" fill="currentColor" opacity="0.6"/>
      <rect x="${cx - r * 0.28}" y="${cy}" width="${r * 0.06}" height="${r * 0.25}" fill="currentColor" opacity="0.5"/>
      <circle cx="${cx + r * 0.25}" cy="${cy - r * 0.15}" r="${r * 0.18}" fill="currentColor" opacity="0.5"/>
      <rect x="${cx + r * 0.22}" y="${cy + r * 0.03}" width="${r * 0.06}" height="${r * 0.22}" fill="currentColor" opacity="0.45"/>
      <!-- 柵 -->
      <line x1="${cx - r * 0.45}" y1="${cy + r * 0.3}" x2="${cx + r * 0.45}" y2="${cy + r * 0.3}" stroke="currentColor" stroke-width="2" opacity="0.4"/>
      <line x1="${cx - r * 0.3}" y1="${cy + r * 0.2}" x2="${cx - r * 0.3}" y2="${cy + r * 0.35}" stroke="currentColor" stroke-width="2" opacity="0.35"/>
      <line x1="${cx}" y1="${cy + r * 0.2}" x2="${cx}" y2="${cy + r * 0.35}" stroke="currentColor" stroke-width="2" opacity="0.35"/>
      <line x1="${cx + r * 0.3}" y1="${cy + r * 0.2}" x2="${cx + r * 0.3}" y2="${cy + r * 0.35}" stroke="currentColor" stroke-width="2" opacity="0.35"/>
    `,
  },
};

function generateStampSVG(category, displayName) {
  const tmpl = TEMPLATES[category];
  if (!tmpl) return null;

  const size = 512;
  const cx = size / 2, cy = size / 2;
  const r = size * 0.42;

  // テキストのフォントサイズを名前の長さに応じて調整
  const nameLen = displayName.length;
  const fontSize = nameLen <= 4 ? 28 : nameLen <= 8 ? 22 : nameLen <= 12 ? 18 : 14;
  const textY = cy + r * 0.55;

  // インクのかすれ効果
  const inkBlots = Array.from({ length: 5 }, (_, i) => {
    const bx = 100 + (i * 137) % 312;
    const by = 100 + (i * 173) % 312;
    const br = 3 + (i * 7) % 5;
    return `<circle cx="${bx}" cy="${by}" r="${br}" fill="${tmpl.stampColor}" opacity="${0.08 + (i % 3) * 0.04}"/>`;
  }).join('\n    ');

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${tmpl.bgColor}"/>
    <!-- 外枠 -->
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${tmpl.stampColor}" stroke-width="7" opacity="0.85"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 13}" fill="none" stroke="${tmpl.stampColor}" stroke-width="2.5" opacity="0.5"/>
    <!-- アイコン -->
    <g color="${tmpl.stampColor}">
      ${tmpl.icon(cx, cy - 15, r * 0.55)}
    </g>
    <!-- テキスト（固有名） -->
    <text x="${cx}" y="${textY}" text-anchor="middle" font-size="${fontSize}" font-family="sans-serif" font-weight="bold" fill="${tmpl.stampColor}" opacity="0.85">${displayName}</text>
    <!-- インク効果 -->
    ${inkBlots}
  </svg>`;
}

async function processStamp(category, displayName, outputPath) {
  const svg = generateStampSVG(category, displayName);
  if (!svg) return null;

  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();

  // 白背景を透過
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const threshold = 230;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > threshold && data[i + 1] > threshold && data[i + 2] > threshold) {
      data[i + 3] = 0;
    }
  }
  const transparent = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 }
  }).png().toBuffer();

  fs.writeFileSync(outputPath, transparent);
  return transparent.length;
}

async function main() {
  const args = process.argv.slice(2);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let pois;
  if (args[0] && fs.existsSync(args[0])) {
    pois = JSON.parse(fs.readFileSync(args[0]));
    console.log(`📁 ${args[0]} から ${pois.length}件読み込み\n`);
  } else {
    // テスト用サンプル
    pois = [
      { name: '明治神宮', category: 'shrine' },
      { name: '浅草寺', category: 'temple' },
      { name: '渋谷', category: 'station' },
      { name: '姫路城', category: 'castle' },
      { name: '犬吠埼灯台', category: 'lighthouse' },
      { name: '道の駅 富士吉田', category: 'rest_area' },
      { name: '箱根温泉', category: 'onsen' },
      { name: '東京国立博物館', category: 'museum' },
      { name: '上野動物園', category: 'zoo' },
      { name: '成田山新勝寺', category: 'temple' },
    ];
    console.log(`🧪 テストモード（サンプル${pois.length}件）\n`);
  }

  // 名前がないPOIを除外
  pois = pois.filter(p => p.name && p.name !== '名称不明' && TEMPLATES[p.category]);

  console.log(`=== テンプレートスタンプ合成 (${pois.length}件) ===\n`);

  const stats = {};
  let processed = 0;
  let totalSize = 0;
  const startTime = Date.now();

  for (const poi of pois) {
    const catDir = path.join(OUTPUT_DIR, poi.category);
    fs.mkdirSync(catDir, { recursive: true });

    const safeName = poi.name.replace(/[\/\\:*?"<>|]/g, '_').slice(0, 50);
    const outPath = path.join(catDir, `${safeName}.png`);

    if (fs.existsSync(outPath)) {
      stats[poi.category] = (stats[poi.category] || 0) + 1;
      processed++;
      continue;
    }

    try {
      const size = await processStamp(poi.category, poi.name, outPath);
      stats[poi.category] = (stats[poi.category] || 0) + 1;
      totalSize += size;
      processed++;

      if (processed % 100 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        console.log(`  ${processed}/${pois.length} (${elapsed}s)`);
      }
    } catch (e) {
      console.log(`  ❌ ${poi.name}: ${e.message}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== 完了 ===`);
  console.log(`処理: ${processed}件 / ${elapsed}秒`);
  console.log(`サイズ: ${(totalSize / 1024 / 1024).toFixed(1)}MB`);
  Object.entries(stats).forEach(([cat, count]) => {
    const label = TEMPLATES[cat]?.label || cat;
    console.log(`  ${label}: ${count}件`);
  });

  // サンプル画像の確認用リスト出力
  const samples = Object.keys(TEMPLATES).map(cat => {
    const dir = path.join(OUTPUT_DIR, cat);
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir).slice(0, 2);
    return files.map(f => `  ${TEMPLATES[cat].label}: ${f}`);
  }).filter(Boolean).flat();
  console.log(`\nサンプル:`);
  samples.forEach(s => console.log(s));
}

main().catch(console.error);
