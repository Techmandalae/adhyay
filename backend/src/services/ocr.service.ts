import fs from "fs/promises";

import { PDFParse } from "pdf-parse";
import sharp from "sharp";
import Tesseract from "tesseract.js";

async function toBuffer(input: Buffer | string) {
  if (Buffer.isBuffer(input)) {
    return input;
  }

  return fs.readFile(input);
}

async function preprocessImage(input: Buffer | string) {
  return sharp(await toBuffer(input))
    .rotate()
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
}

export async function extractTextFromImage(input: Buffer | string) {
  const imageBuffer = await preprocessImage(input);
  const result = await Tesseract.recognize(imageBuffer, "eng");
  return result.data.text.trim();
}

export async function extractTextFromPDF(input: Buffer | string) {
  const buffer = await toBuffer(input);
  const parser = new PDFParse({ data: buffer });
  try {
    const data = await parser.getText();
    return data.text.trim();
  } finally {
    await parser.destroy();
  }
}
