import fs from "fs/promises";

import { PDFParse } from "pdf-parse";
import sharp from "sharp";
import Tesseract from "tesseract.js";

async function preprocessImage(filePath: string) {
  return sharp(filePath)
    .rotate()
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
}

export async function extractTextFromImage(filePath: string) {
  const imageBuffer = await preprocessImage(filePath);
  const result = await Tesseract.recognize(imageBuffer, "eng");
  return result.data.text.trim();
}

export async function extractTextFromPDF(filePath: string) {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const data = await parser.getText();
    return data.text.trim();
  } finally {
    await parser.destroy();
  }
}
