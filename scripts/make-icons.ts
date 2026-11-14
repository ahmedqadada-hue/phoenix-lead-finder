// Renders the PNG app icons from the SVG source (public/icons/icon.svg).
import sharp from "sharp";
import { readFileSync } from "node:fs";

const svg = readFileSync("public/icons/icon.svg");
const maskable = Buffer.from(readFileSync("public/icons/icon.svg", "utf8").replace('rx="112"', 'rx="0"'));

async function main() {
  await sharp(svg, { density: 300 }).resize(192, 192).png().toFile("public/icons/icon-192.png");
  await sharp(svg, { density: 300 }).resize(512, 512).png().toFile("public/icons/icon-512.png");
  await sharp(maskable, { density: 300 }).resize(512, 512).png().toFile("public/icons/icon-maskable-512.png");
  await sharp(maskable, { density: 300 }).resize(180, 180).png().toFile("public/icons/apple-touch-icon.png");
  console.log("icons written");
}
main();
