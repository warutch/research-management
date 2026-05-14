import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

// ระบุ turbopack.root เฉพาะตอนที่มี node_modules ใน dir นี้
// — main repo + deploy: มี node_modules → set root กัน multiple-lockfiles warning
// — worktree (.claude/worktrees/...): ไม่มี node_modules ของตัวเอง → ปล่อย default
//   ให้ Next.js หา parent's node_modules เอง (ไม่งั้น dev server fail)
const hasLocalNodeModules = fs.existsSync(path.join(__dirname, "node_modules", "next", "package.json"));

const nextConfig: NextConfig = {
  ...(hasLocalNodeModules
    ? { turbopack: { root: path.join(__dirname) } }
    : {}),
};

export default nextConfig;
