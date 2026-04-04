/**
 * Geminiスタンプ生成 v2 — プロンプト改善 + 円外のみ透過
 */
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve('public/gemini-stamps-v2');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// v2: 背景を純白に強調
const STAMP_PROMPT_V2 = `Japanese station stamp — a rubber ink impression.
No letters, kanji, kana, numbers, dates, labels, or symbols — anywhere in the image.
{TITLE} is a SHAPE REFERENCE only. Render its silhouette. NEVER write its name.

--- BACKGROUND (CRITICAL) ---
The background outside the stamp circle MUST be PURE WHITE (#FFFFFF, RGB 255,255,255).
NO texture, NO grain, NO off-white, NO gray tones outside the circle.
The background must be completely flat, uniform, pure white.

--- STAMP FORMAT ---
CIRCULAR ink stamp, fills ~90% canvas height. Pure white background (#FFFFFF) outside circle.
NO rectangular frames. NOT a postage stamp. Ink impression has slightly uneven pressure.
The circle outline must be clearly defined with no feathering into the background.

--- INSIDE THE STAMP ---
Street View perspective of {TITLE}. Street leads eye to landmark in background.
Landmark silhouette fills ~45–55% of the circle. Wide breathing space inside.

--- INK TEXTURE ---
Subtle rubber-stamp ink effect inside the circle only. Gentle ink bleed at edges.
Mostly even ink pressure. Any grain strictly within the stamp boundary.

--- COLOR ---
Use 2–4 ink colors from: {PALETTE}.
Colors appear as absorbed ink, slightly muted and desaturated.
DO NOT use white or near-white colors inside the stamp. Fill all areas with ink colors.

--- VISUAL STYLE ---
Flat graphic shapes, geometric simplification, NO gradients.
Strong silhouette, Showa-era retro illustration. NO photorealism.
Image size: 1024x1024 pixels.`;

// v2: 円検出 → 円の外側のみ透過
async function removeBackgroundOutsideCircle(imageBuffer) {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width, h = info.height;
  const cx = w / 2, cy = h / 2;

  // 円の半径を検出: 中心から外に向かって色が変わる位置を探す
  let stampRadius = 0;
  for (let r = Math.min(cx, cy) - 1; r > 50; r--) {
    // 円周上の8点をサンプリング
    let darkPixels = 0;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      const px = Math.round(cx + r * Math.cos(angle));
      const py = Math.round(cy + r * Math.sin(angle));
      const idx = (py * w + px) * 4;
      const avg = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (avg < 200) darkPixels++;
    }
    if (darkPixels >= 3) {
      stampRadius = r + 5; // 少しマージン
      break;
    }
  }

  if (stampRadius === 0) stampRadius = Math.min(cx, cy) * 0.9;
  console.log(`  🔍 Circle detected: radius=${stampRadius}px (${(stampRadius / cx * 100).toFixed(0)}%)`);

  // 円の外側のみ透過
  let transparentPixels = 0;
  const threshold = 240;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const idx = (y * w + x) * 4;

      if (dist > stampRadius) {
        // 円の外側: 白に近ければ透過
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        if (r > threshold && g > threshold && b > threshold) {
          data[idx + 3] = 0;
          transparentPixels++;
        }
      }
      // 円の内側: 透過しない（そのまま維持）
    }
  }

  console.log(`  ✂️ ${transparentPixels} pixels transparent (outside circle only)`);

  return sharp(data, {
    raw: { width: w, height: h, channels: 4 }
  }).png().toBuffer();
}

const TEST_SPOTS = [
  { name: 'Tokyo Tower', palette: 'vermillion, navy blue, warm gray', file: 'tokyo_tower' },
  { name: 'Kaminarimon Gate Asakusa', palette: 'crimson red, dark brown, gold ochre', file: 'kaminarimon' },
  { name: 'Shibuya Scramble Crossing', palette: 'deep purple, midnight blue, silver', file: 'shibuya_scramble' },
  { name: 'Meiji Shrine Torii', palette: 'forest green, dark brown, vermillion', file: 'meiji_shrine' },
];

async function main() {
  console.log('=== Geminiスタンプ v2（プロンプト改善 + 円外のみ透過）===\n');

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-image',
    generationConfig: { responseModalities: ['image', 'text'] }
  });

  for (const spot of TEST_SPOTS) {
    console.log(`📍 ${spot.name}`);
    try {
      const prompt = STAMP_PROMPT_V2
        .replace(/\{TITLE\}/g, spot.name)
        .replace(/\{PALETTE\}/g, spot.palette);

      console.log(`  🎨 Generating...`);
      const result = await model.generateContent(prompt);
      let imageBuffer = null;

      for (const candidate of result.response.candidates) {
        for (const part of candidate.content.parts) {
          if (part.inlineData) {
            imageBuffer = Buffer.from(part.inlineData.data, 'base64');
          }
        }
      }

      if (!imageBuffer) { console.log('  ❌ No image\n'); continue; }

      // 元画像保存
      const origPath = path.join(OUTPUT_DIR, `${spot.file}_original.png`);
      fs.writeFileSync(origPath, imageBuffer);
      const meta = await sharp(imageBuffer).metadata();
      console.log(`  📁 Original: ${meta.width}x${meta.height}`);

      // v2透過処理
      const transparent = await removeBackgroundOutsideCircle(imageBuffer);
      const transPath = path.join(OUTPUT_DIR, `${spot.file}_transparent.png`);
      fs.writeFileSync(transPath, transparent);
      console.log(`  ✅ Done\n`);

      await new Promise(r => setTimeout(r, 5000));
    } catch (e) {
      console.log(`  ❌ ${e.message.substring(0, 150)}\n`);
    }
  }

  console.log('📁 Output:');
  fs.readdirSync(OUTPUT_DIR).forEach(f => {
    const size = (fs.statSync(path.join(OUTPUT_DIR, f)).size / 1024).toFixed(0);
    console.log(`  ${f} (${size}KB)`);
  });
}

main().catch(console.error);
