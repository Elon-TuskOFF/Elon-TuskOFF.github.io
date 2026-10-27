import { cp, mkdir, rm } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const output = new URL("dist/", root);

// Publish only browser assets, keeping build tools and original artwork private.
const assets = [
  "index.html",
  "index.css",
  "index.js",
  "wallpapers.js",
  "images/Minecraft_Polytechnic.png",
  "images/gregtechlogo.png",
  "images/wallpapers/",
  "gifs/animated_minecraftPoly.gif",
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const asset of assets) {
  const destination = new URL(asset, output);
  await mkdir(new URL(".", destination), { recursive: true });
  await cp(new URL(asset, root), destination, { recursive: true });
}

console.log("Prepared static site in dist/.");
