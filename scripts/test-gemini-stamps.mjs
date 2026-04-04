/**
 * Gemini実画像スタンプ生成テスト
 * 課金済みAPIで実際のスタンプを生成し、Sharp透過処理まで一気通貫で検証
 */
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve('public/gemini-stamps');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const STAMP_PROMPT = `Japanese station stamp — a rubber ink impression.
No letters, kanji, kana, numbers, dates, labels, or symbols — anywhere in the image.
{TITLE} is a SHAPE REFERENCE only. Render its silhouette. NEVER write its name.

--- STAMP FORMAT ---
CIRCULAR ink stamp, fills ~90% canvas height. Flat off-white background (#FFFFFF) outside circle.
NO rectangular frames. NOT a postage stamp. Ink impression has slightly uneven pressure.

--- INSIDE THE STAMP ---
Street View perspective of {TITLE}. Street leads eye to landmark in background.
Landmark silhouette fills ~45–55% of the circle. Wide breathing space inside.

--- INK TEXTURE ---
Subtle rubber-stamp ink effect inside the circle only. Gentle ink bleed at edges.
Mostly even ink pressure. Any grain strictly within the stamp boundary.

--- COLOR ---
Use 2–4 ink colors from: {PALETTE}.
Colors appear as absorbed ink, slightly muted and desaturated.

--- VISUAL STYLE ---
Flat graphic shapes, geometric simplification, NO gradients.
Strong silhouette, Showa-era retro illustration. NO photorealism. Flat off-white background.
Image size: 512x512 pixels.`;

async function removeWhiteBackground(imageBuffer, threshold = 230) {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > threshold && data[i + 1] > threshold && data[i + 2] > threshold) {
      data[i + 3] = 0;
    }
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 }
  }).png().toBuffer();
}

async function generateStamp(spotName, palette) {
  const prompt = STAMP_PROMPT
    .replace(/\{TITLE\}/g, spotName)
    .replace(/\{PALETTE\}/g, palette);

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    generationConfig: { responseModalities: ['image', 'text'] }
  });

  console.log(`  🎨 Generating...`);
  const result = await model.generateContent(prompt);

  for (const candidate of result.response.candidates) {
    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        return Buffer.from(part.inlineData.data, 'base64');
      }
    }
  }
  throw new Error('No image in response');
}

const TEST_SPOTS = [
  { name: 'Tokyo Tower', palette: 'vermillion, navy blue, warm gray', file: 'tokyo_tower' },
  { name: 'Kaminarimon Gate Asakusa', palette: 'crimson red, dark brown, gold ochre', file: 'kaminarimon' },
  { name: 'Shibuya Scramble Crossing', palette: 'deep purple, midnight blue, silver', file: 'shibuya_scramble' },
  { name: 'Meiji Shrine Torii', palette: 'forest green, dark brown, vermillion', file: 'meiji_shrine' },
];

async function main() {
  console.log('=== Gemini実画像スタンプ生成テスト ===\n');

  // まず利用可能なモデルを確認
  const models = ['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview'];
  let workingModel = null;

  for (const modelName of models) {
    try {
      console.log(`モデル ${modelName} を試行...`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseModalities: ['image', 'text'] }
      });
      const testResult = await model.generateContent('Generate a simple red circle on white background. 64x64 pixels.');
      for (const candidate of testResult.response.candidates) {
        for (const part of candidate.content.parts) {
          if (part.inlineData) {
            workingModel = modelName;
            console.log(`  ✅ ${modelName} で画像生成可能\n`);
            break;
          }
        }
        if (workingModel) break;
      }
      if (workingModel) break;
    } catch (e) {
      console.log(`  ❌ ${modelName}: ${e.message.substring(0, 100)}\n`);
    }
  }

  if (!workingModel) {
    console.log('画像生成可能なモデルが見つかりませんでした。');
    return;
  }

  // 本番スタンプ生成
  for (const spot of TEST_SPOTS) {
    console.log(`📍 ${spot.name} (${spot.palette})`);
    try {
      const prompt = STAMP_PROMPT
        .replace(/\{TITLE\}/g, spot.name)
        .replace(/\{PALETTE\}/g, spot.palette);

      const model = genAI.getGenerativeModel({
        model: workingModel,
        generationConfig: { responseModalities: ['image', 'text'] }
      });

      console.log(`  🎨 Generating with ${workingModel}...`);
      const result = await model.generateContent(prompt);
      let imageBuffer = null;

      for (const candidate of result.response.candidates) {
        for (const part of candidate.content.parts) {
          if (part.inlineData) {
            imageBuffer = Buffer.from(part.inlineData.data, 'base64');
          }
        }
      }

      if (!imageBuffer) {
        console.log('  ❌ No image in response');
        continue;
      }

      // 元画像保存
      const origPath = path.join(OUTPUT_DIR, `${spot.file}_original.png`);
      fs.writeFileSync(origPath, imageBuffer);
      const meta = await sharp(imageBuffer).metadata();
      console.log(`  📁 Original: ${meta.width}x${meta.height} (${(imageBuffer.length / 1024).toFixed(0)}KB)`);

      // 透過処理
      const transparent = await removeWhiteBackground(imageBuffer);
      const transPath = path.join(OUTPUT_DIR, `${spot.file}_transparent.png`);
      fs.writeFileSync(transPath, transparent);
      console.log(`  📁 Transparent: ${(transparent.length / 1024).toFixed(0)}KB`);
      console.log(`  ✅ 完了\n`);

      // レート制限対策
      await new Promise(r => setTimeout(r, 5000));
    } catch (e) {
      console.log(`  ❌ ${e.message.substring(0, 150)}\n`);
    }
  }

  console.log(`📁 Output: ${OUTPUT_DIR}/`);
  fs.readdirSync(OUTPUT_DIR).forEach(f => {
    const size = (fs.statSync(path.join(OUTPUT_DIR, f)).size / 1024).toFixed(0);
    console.log(`  ${f} (${size}KB)`);
  });
  console.log('\n✅ テスト完了');
}

main().catch(console.error);
