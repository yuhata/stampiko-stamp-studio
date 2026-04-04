/**
 * ギャラリーのサンプルスタンプを全てGemini実画像に置き換え
 * 9スポット × 4候補 = 36枚
 */
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const STAMPS_DIR = path.resolve('public/stamps');

const PROMPT = `Japanese station stamp — a rubber ink impression.
No letters, kanji, kana, numbers, dates, labels, or symbols — anywhere in the image.
{TITLE} is a SHAPE REFERENCE only. Render its silhouette. NEVER write its name.

--- BACKGROUND (CRITICAL) ---
The background outside the stamp circle MUST be PURE WHITE (#FFFFFF).
NO texture, NO grain, NO off-white outside the circle.

--- STAMP FORMAT ---
CIRCULAR ink stamp, fills ~90% canvas height. Pure white background outside circle.
NO rectangular frames. NOT a postage stamp.

--- INSIDE THE STAMP ---
Street View perspective of {TITLE}. Landmark silhouette fills ~45–55% of the circle.

--- INK TEXTURE ---
Subtle rubber-stamp ink effect inside the circle only. Gentle ink bleed at edges.

--- COLOR ---
Use 2–4 ink colors from: {PALETTE}.
Colors appear as absorbed ink, slightly muted and desaturated.
DO NOT use white or near-white colors inside the stamp.

--- VISUAL STYLE ---
Flat graphic shapes, geometric simplification, NO gradients.
Strong silhouette, Showa-era retro illustration. NO photorealism.
Image size: 512x512 pixels.`;

const SPOTS = [
  { id: 'kaminarimon', name: 'Kaminarimon Gate', area: 'asakusa', palette: 'crimson red, dark brown, gold ochre', spotName: '雷門' },
  { id: 'sensoji', name: 'Sensoji Temple Asakusa', area: 'asakusa', palette: 'deep red, dark brown, warm gray', spotName: '浅草寺' },
  { id: 'skytree', name: 'Tokyo Skytree tower', area: 'asakusa', palette: 'steel blue, slate gray, light navy', spotName: 'スカイツリー' },
  { id: 'scramble', name: 'Shibuya Scramble Crossing', area: 'shibuya', palette: 'deep purple, midnight blue, silver', spotName: '渋谷スクランブル' },
  { id: 'hachiko', name: 'Hachiko statue Shibuya', area: 'shibuya', palette: 'burnt orange, dark brown, warm bronze', spotName: 'ハチ公像' },
  { id: 'meiji', name: 'Meiji Shrine Torii gate', area: 'shibuya', palette: 'forest green, dark brown, vermillion', spotName: '明治神宮' },
  { id: 'omoide', name: 'Omoide Yokocho alley Shinjuku', area: 'shinjuku', palette: 'warm orange, burnt sienna, amber', spotName: '思い出横丁' },
  { id: 'godzilla', name: 'Godzilla head Kabukicho Shinjuku', area: 'shinjuku', palette: 'charcoal black, dark green, deep gray', spotName: 'ゴジラヘッド' },
  { id: 'tocho', name: 'Tokyo Metropolitan Government Building', area: 'shinjuku', palette: 'navy blue, steel blue, slate gray', spotName: '東京都庁' },
];

async function removeBackgroundOutsideCircle(imageBuffer) {
  const { data, info } = await sharp(imageBuffer)
    .resize(512, 512)
    .ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width, h = info.height;
  const cx = w / 2, cy = h / 2;

  let stampRadius = 0;
  for (let r = Math.min(cx, cy) - 1; r > 50; r--) {
    let darkPixels = 0;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      const px = Math.round(cx + r * Math.cos(angle));
      const py = Math.round(cy + r * Math.sin(angle));
      const idx = (py * w + px) * 4;
      const avg = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (avg < 200) darkPixels++;
    }
    if (darkPixels >= 3) { stampRadius = r + 5; break; }
  }
  if (stampRadius === 0) stampRadius = Math.min(cx, cy) * 0.9;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const idx = (y * w + x) * 4;
      if (dist > stampRadius) {
        if (data[idx] > 240 && data[idx + 1] > 240 && data[idx + 2] > 240) {
          data[idx + 3] = 0;
        }
      }
    }
  }

  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function main() {
  console.log('=== ギャラリースタンプ Gemini再生成 (36枚) ===\n');

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-image',
    generationConfig: { responseModalities: ['image', 'text'] }
  });

  const manifest = JSON.parse(fs.readFileSync(path.join(STAMPS_DIR, 'manifest.json')));
  let generated = 0, failed = 0;

  for (const spot of SPOTS) {
    console.log(`📍 ${spot.spotName} (${spot.id})`);

    for (let v = 0; v < 4; v++) {
      const filename = `${spot.id}_v${v}.png`;
      const outPath = path.join(STAMPS_DIR, spot.area, filename);

      try {
        const prompt = PROMPT
          .replace(/\{TITLE\}/g, spot.name)
          .replace(/\{PALETTE\}/g, spot.palette);

        const result = await model.generateContent(prompt);
        let imageBuffer = null;
        for (const candidate of result.response.candidates) {
          for (const part of candidate.content.parts) {
            if (part.inlineData) {
              imageBuffer = Buffer.from(part.inlineData.data, 'base64');
            }
          }
        }

        if (!imageBuffer) { console.log(`  ❌ v${v}: no image`); failed++; continue; }

        const transparent = await removeBackgroundOutsideCircle(imageBuffer);
        fs.writeFileSync(outPath, transparent);
        generated++;
        process.stdout.write(`  ✅ v${v} `);

        await new Promise(r => setTimeout(r, 3000));
      } catch (e) {
        console.log(`  ❌ v${v}: ${e.message.substring(0, 80)}`);
        failed++;
        await new Promise(r => setTimeout(r, 10000));
      }
    }
    console.log('');
  }

  console.log(`\n✅ 完了: ${generated}枚生成, ${failed}枚失敗`);
}

main().catch(console.error);
