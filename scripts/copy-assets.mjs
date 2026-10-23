import { chmodSync, cpSync, rmSync } from "node:fs";

const ASSET_DIRS = [
  ["src/db/migrations", "build/db/migrations"],
  ["src/web", "build/web"],
];

for (const [from, to] of ASSET_DIRS) {
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}
chmodSync("build/index.js", 0o755);
