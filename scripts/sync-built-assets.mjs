import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const publicAssets = resolve(root, "public", "assets");
const builtAssets = resolve(root, "dist", "client", "assets");
const action = process.argv[2];

if (action === "clean") {
  await rm(publicAssets, { recursive: true, force: true });
} else if (action === "sync") {
  await rm(publicAssets, { recursive: true, force: true });
  await mkdir(publicAssets, { recursive: true });
  await cp(builtAssets, publicAssets, { recursive: true });
} else {
  throw new Error("Use `clean` before the build or `sync` after the build.");
}
