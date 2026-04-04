/**
 * Notion → specs/ ディレクトリへのエクスポートスクリプト
 * 仕様書をNotionから取得し、リポジトリ内のmdファイルとして配置
 *
 * 使い方:
 *   node scripts/export-specs-from-notion.mjs                  # 全ページエクスポート
 *   node scripts/export-specs-from-notion.mjs --page design    # 特定ページのみ
 *
 * 前提:
 *   NOTION_API_KEY 環境変数が必要（Notion Integration Token）
 *   https://www.notion.so/my-integrations で作成
 *
 * 出力先: specs/ ディレクトリ
 */
import fs from 'fs';
import path from 'path';

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_VERSION = '2022-06-28';
const SPECS_DIR = path.resolve('specs');

// エクスポート対象ページ
const PAGES = {
  requirements: {
    id: '338689ab-28fa-8193-960f-e607b2a5cc13',
    title: 'サービス全体設計',
    output: 'requirements.md',
    description: 'サービスの戦略・設計・プロモーション・コスト',
  },
  design: {
    id: '338689ab-28fa-8122-bb9a-e3e9f328818d',
    title: 'UI・画面設計書',
    output: 'design.md',
    description: '画面構成・各画面の要素定義・ワイヤーフレーム',
  },
  implementation: {
    id: '338689ab-28fa-8165-a875-c98a2449f270',
    title: '実装仕様書',
    output: 'implementation.md',
    description: 'コードスニペット・データモデル・API仕様',
  },
  stamps: {
    id: '338689ab-28fa-816e-8a5e-ccfce0259db5',
    title: 'スタンプデザイン一覧',
    output: 'stamp-designs.md',
    description: 'ランドマーク層・テンプレートスタンプのデザイン方針',
  },
  quality: {
    id: '337689ab-28fa-811a-98ed-ddb5babd78ad',
    title: 'スタンプデザイン品質管理フロー',
    output: 'quality-management.md',
    description: '品質管理の実装詳細・NG学習ループ',
  },
  branding: {
    id: '337689ab-28fa-8133-b142-c6542a7c91cb',
    title: 'Stampiko ブランディングガイド',
    output: 'branding.md',
    description: 'ロゴ・カラー・名刺・アプリアイコン仕様',
  },
};

async function fetchNotionPage(pageId) {
  // ページのプロパティ取得
  const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: {
      'Authorization': `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
    },
  });
  if (!pageRes.ok) throw new Error(`Page fetch failed: ${pageRes.status}`);
  const page = await pageRes.json();

  // ブロックの子要素を再帰的に取得
  const blocks = await fetchAllBlocks(pageId);
  return { page, blocks };
}

async function fetchAllBlocks(blockId, cursor = undefined) {
  const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
  if (cursor) url.searchParams.set('start_cursor', cursor);
  url.searchParams.set('page_size', '100');

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
    },
  });
  if (!res.ok) throw new Error(`Blocks fetch failed: ${res.status}`);
  const data = await res.json();

  let blocks = data.results;

  // 子ブロックがある場合は再帰取得
  for (const block of blocks) {
    if (block.has_children && block.type !== 'child_page') {
      block.children = await fetchAllBlocks(block.id);
    }
  }

  // ページネーション
  if (data.has_more) {
    const more = await fetchAllBlocks(blockId, data.next_cursor);
    blocks = blocks.concat(more);
  }

  return blocks;
}

function richTextToMd(richTexts) {
  if (!richTexts) return '';
  return richTexts.map(rt => {
    let text = rt.plain_text || '';
    if (rt.annotations?.bold) text = `**${text}**`;
    if (rt.annotations?.italic) text = `*${text}*`;
    if (rt.annotations?.code) text = `\`${text}\``;
    if (rt.annotations?.strikethrough) text = `~~${text}~~`;
    if (rt.href) text = `[${text}](${rt.href})`;
    return text;
  }).join('');
}

function blocksToMarkdown(blocks, indent = 0) {
  const lines = [];
  const prefix = '  '.repeat(indent);

  for (const block of blocks) {
    switch (block.type) {
      case 'heading_1':
        lines.push(`\n# ${richTextToMd(block.heading_1.rich_text)}\n`);
        break;
      case 'heading_2':
        lines.push(`\n## ${richTextToMd(block.heading_2.rich_text)}\n`);
        break;
      case 'heading_3':
        lines.push(`\n### ${richTextToMd(block.heading_3.rich_text)}\n`);
        break;
      case 'paragraph':
        const text = richTextToMd(block.paragraph.rich_text);
        lines.push(text ? `${prefix}${text}\n` : '\n');
        break;
      case 'bulleted_list_item':
        lines.push(`${prefix}- ${richTextToMd(block.bulleted_list_item.rich_text)}`);
        if (block.children) lines.push(blocksToMarkdown(block.children, indent + 1));
        break;
      case 'numbered_list_item':
        lines.push(`${prefix}1. ${richTextToMd(block.numbered_list_item.rich_text)}`);
        if (block.children) lines.push(blocksToMarkdown(block.children, indent + 1));
        break;
      case 'to_do':
        const checked = block.to_do.checked ? 'x' : ' ';
        lines.push(`${prefix}- [${checked}] ${richTextToMd(block.to_do.rich_text)}`);
        break;
      case 'code':
        const lang = block.code.language || '';
        lines.push(`\n\`\`\`${lang}\n${richTextToMd(block.code.rich_text)}\n\`\`\`\n`);
        break;
      case 'quote':
        lines.push(`\n> ${richTextToMd(block.quote.rich_text)}\n`);
        break;
      case 'callout':
        const icon = block.callout.icon?.emoji || '💡';
        lines.push(`\n> ${icon} ${richTextToMd(block.callout.rich_text)}\n`);
        break;
      case 'divider':
        lines.push('\n---\n');
        break;
      case 'table':
        if (block.children) {
          const rows = block.children;
          rows.forEach((row, ri) => {
            if (row.type === 'table_row') {
              const cells = row.table_row.cells.map(cell => richTextToMd(cell));
              lines.push(`| ${cells.join(' | ')} |`);
              if (ri === 0) {
                lines.push(`| ${cells.map(() => '---').join(' | ')} |`);
              }
            }
          });
          lines.push('');
        }
        break;
      case 'image':
        const url = block.image.file?.url || block.image.external?.url || '';
        const caption = block.image.caption ? richTextToMd(block.image.caption) : '';
        if (url) lines.push(`\n![${caption}](${url})\n`);
        break;
      case 'toggle':
        lines.push(`\n<details>\n<summary>${richTextToMd(block.toggle.rich_text)}</summary>\n`);
        if (block.children) lines.push(blocksToMarkdown(block.children, indent));
        lines.push('</details>\n');
        break;
      case 'child_page':
        lines.push(`\n> 📄 サブページ: ${block.child_page.title}\n`);
        break;
      default:
        // 未対応ブロックはスキップ
        break;
    }
  }

  return lines.join('\n');
}

async function exportPage(key, config) {
  console.log(`📄 ${config.title} → ${config.output}`);
  try {
    const { page, blocks } = await fetchNotionPage(config.id);

    // タイトル取得
    const title = page.properties?.title?.title?.[0]?.plain_text || config.title;

    // Markdown生成
    let md = `# ${title}\n\n`;
    md += `> ${config.description}\n`;
    md += `> \n`;
    md += `> Source: https://www.notion.so/${config.id.replace(/-/g, '')}\n`;
    md += `> Exported: ${new Date().toISOString()}\n`;
    md += `> ⚠️ このファイルはNotionから自動生成されています。直接編集せず、Notionを更新してください。\n\n`;
    md += blocksToMarkdown(blocks);

    // 保存
    const outPath = path.join(SPECS_DIR, config.output);
    fs.writeFileSync(outPath, md);
    console.log(`  ✅ ${(Buffer.byteLength(md) / 1024).toFixed(1)}KB`);
    return true;
  } catch (e) {
    console.log(`  ❌ ${e.message}`);
    return false;
  }
}

async function main() {
  if (!NOTION_API_KEY) {
    console.log(`
=== Notion → specs/ エクスポートスクリプト ===

NOTION_API_KEY が設定されていません。

セットアップ手順:
1. https://www.notion.so/my-integrations にアクセス
2. 「New integration」でインテグレーションを作成
   - Name: Stampiko Spec Export
   - Capabilities: Read content
3. 発行された Internal Integration Secret を .env に追加:
   NOTION_API_KEY=ntn_xxxxxxxxxxxxx
4. Notion上で対象ページを開き、右上「...」→「Connections」→ 作成したインテグレーションを追加
5. 再度このスクリプトを実行

対象ページ:
${Object.entries(PAGES).map(([k, v]) => `  - ${v.title} (${k})`).join('\n')}

出力先: specs/
`);

    // API KEY なしでもCLAUDE.mdは生成できる
    console.log('CLAUDE.md を生成します...\n');
    generateClaudeMd();
    return;
  }

  fs.mkdirSync(SPECS_DIR, { recursive: true });

  const args = process.argv.slice(2);
  const targetKey = args.find(a => !a.startsWith('-'))?.replace('--page=', '');

  const targets = targetKey
    ? [[targetKey, PAGES[targetKey]]].filter(([, v]) => v)
    : Object.entries(PAGES);

  if (targets.length === 0) {
    console.log('Unknown page key. Available:', Object.keys(PAGES).join(', '));
    return;
  }

  console.log(`=== Notion → specs/ エクスポート (${targets.length}ページ) ===\n`);

  let success = 0;
  for (const [key, config] of targets) {
    if (await exportPage(key, config)) success++;
    await new Promise(r => setTimeout(r, 500)); // レート制限対策
  }

  // CLAUDE.md も生成
  generateClaudeMd();

  console.log(`\n✅ ${success}/${targets.length} ページエクスポート完了`);
  console.log(`📁 ${SPECS_DIR}/`);
  fs.readdirSync(SPECS_DIR).forEach(f => {
    const size = (fs.statSync(path.join(SPECS_DIR, f)).size / 1024).toFixed(1);
    console.log(`  ${f} (${size}KB)`);
  });
}

function generateClaudeMd() {
  const claudeMd = `# Stampiko (LBS Stamp Collection)

## Project Structure
- /frontend — Vite + React + Leaflet (user-facing)
- /api — Express.js + Vercel (GPS verify, AI, Firebase)
- /backend — Vite + React (admin panel)

## Specs
仕様書は specs/ ディレクトリにあります。Notionがマスターで、mdは同期コピーです。
- specs/requirements.md — サービス全体設計（戦略・設計・プロモ・コスト）
- specs/design.md — UI・画面設計書
- specs/implementation.md — 実装仕様書（コード・データモデル・API）
- specs/stamp-designs.md — スタンプデザイン方針
- specs/quality-management.md — 品質管理フロー
- specs/branding.md — ブランディングガイド

## Key Dependencies
- Firebase SDK 10.x (Firestore, Storage, Auth)
- Gemini API (@google/generative-ai) — model: gemini-2.5-flash-image
- Leaflet 1.9.x + react-leaflet
- sharp (image processing in API)
- html2canvas (share card / certificate generation)
- satori + @vercel/og (OGP image generation)
- react-i18next (i18n)

## Environment Variables
- GEMINI_API_KEY
- FIREBASE_* (serviceAccount for API)
- VITE_FIREBASE_* (client config for frontend)

## Code Conventions
- Firestore: snake_case for collection names, camelCase for fields
- All timestamps: serverTimestamp() on write, toDate() on read
- GPS validation: always use Haversine before AI verify
- Images: always process through removeWhiteBackground() before Storage upload
- Spot types: 'landmark' (curated), 'data_spot' (auto-registered), 'generic' (category-only)
- Rank check: always call checkRankUp() after stamp acquisition
- Template stamps: SVG/Canvas composition, NO Gemini API usage

## Two-Layer Spot Architecture
- Landmark layer: 60 spots (3 areas × 20), unique AI-generated stamps, designer-curated
- Data spot layer: 154K+ POIs from OSM (9 categories), template stamps with name overlay

## Testing
- Test spots: Tokyo Tower (35.6586, 139.7454), 洗足池 (35.5727, 139.7108)
- GPS radius: 100m default (200m for stations)
- Welcome stamp: spotId = 'welcome'
- Dev GPS override: Chrome DevTools → Sensors → Location
`;
  const outPath = path.join(SPECS_DIR, '..', 'CLAUDE.md');
  fs.writeFileSync(outPath, claudeMd);
  console.log(`📋 CLAUDE.md generated`);
}

main().catch(console.error);
