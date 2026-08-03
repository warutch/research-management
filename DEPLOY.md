# 🚀 คู่มือ Deploy ระบบที่อัพเดท

คู่มือนี้สำหรับ **deploy version ใหม่** ทับของเดิมที่อยู่บน Vercel

---

## 📋 Overview — ทำไมต้อง 3 ขั้นตอน

เมื่อมีการอัพเดทระบบ มี 3 ส่วนที่อาจต้องเปลี่ยน:

| ส่วน | เมื่อไหร่ต้องทำ | ที่ไหน |
|---|---|---|
| **1. Database Schema** | เมื่อมี field/table ใหม่ | Supabase SQL Editor |
| **2. Code** | ทุกครั้งที่แก้ code | GitHub → Vercel (auto) |
| **3. Environment** | เมื่อมี env var ใหม่ | Vercel Settings |

---

## 🧪 ขั้นที่ 0: Test on Local ก่อน Deploy (แนะนำให้ทำทุกครั้ง)

ก่อน push ขึ้น production ควรรันบน local ก่อนเพื่อจับ bug ตั้งแต่เนิ่น ๆ — ประหยัดเวลากว่ารอ Vercel build ล้มเหลวแล้วค่อยมาแก้

### Step 1 — แก้โค้ดใน dev folder

```bash
cd /Users/warut.ch/Documents/ResearchProject/Portfolio/research-management
# แก้ไฟล์ใน src/...
```

> ⚠️ อย่าแก้ใน `research-management-deploy/` หรือใน `.claude/worktrees/...` — rsync รอบหน้าจะทับทิ้ง

### Step 2 — รัน dev server บน local

```bash
cd /Users/warut.ch/Documents/ResearchProject/Portfolio/research-management
npx next dev
```

เปิดเบราว์เซอร์ที่ http://localhost:3000

> ✅ `.env.local` ใน dev folder มี Supabase URL/key อยู่แล้ว — เชื่อม DB ตัวเดียวกับ production
> ⚠️ ระวัง: ทดสอบบน local **จะกระทบข้อมูลจริงใน Supabase production** ถ้าไม่อยากกระทบ ให้สร้างโครงการทดสอบแล้วลบทิ้งหลังเทส

### Step 3 — Test feature ที่แก้

- [ ] กดเข้าเมนูที่แก้ ลองใช้งาน feature ใหม่
- [ ] เช็ค console บนเบราว์เซอร์ (DevTools → Console) ว่าไม่มี error
- [ ] เช็ค Network tab ว่า request ไป Supabase สำเร็จ
- [ ] ทดสอบ edge cases (กรอกข้อมูลผิด, ลบ, แก้ไข)

### Step 4 — Build local เช็คว่า production build ผ่าน

```bash
cd /Users/warut.ch/Documents/ResearchProject/Portfolio/research-management
npx next build
```

ถ้า build ผ่าน → พร้อม deploy ถ้า build ล้มเหลว → แก้ก่อน (Vercel จะ build ล้มเหลวเหมือนกัน)

### 💡 Tips สำหรับทดสอบ local

1. **HMR (Hot Module Reload)** — แก้โค้ดแล้วเบราว์เซอร์ refresh เอง ไม่ต้องรีสตาร์ท `next dev`
2. **เช็ค port ชน** — ถ้า port 3000 ถูกใช้แล้ว Next.js จะลอง 3001, 3002 ต่อ
3. **Clear cache** — ถ้าเจอพฤติกรรมแปลก ลบ `.next/` แล้วรันใหม่:
   ```bash
   rm -rf .next && npx next dev
   ```
4. **ทดสอบบน production build local** (ใกล้เคียง Vercel ที่สุด):
   ```bash
   npx next build && npx next start
   ```
5. **Supabase tip** — ก่อนทดสอบ feature ที่เขียน DB เยอะ ๆ ลอง export JSON จาก sidebar เก็บ backup ไว้ก่อน

---

## 🔄 ขั้นตอนการ Deploy

### ขั้นที่ 1: อัพเดท Database (ถ้าจำเป็น)

ถ้า release ใหม่มี **table ใหม่** หรือ **column ใหม่** ต้องรัน SQL ก่อน

1. ไปที่ **Supabase Dashboard** → เลือก project
2. เมนูซ้าย → **SQL Editor** → **New query**
3. เปิดไฟล์ `supabase/schema.sql` ในโปรเจค
4. **คัดลอกทั้งไฟล์** → วางใน SQL Editor → กด **Run**

> 💡 ไฟล์ `schema.sql` ใช้ `CREATE TABLE IF NOT EXISTS` และ `ADD COLUMN IF NOT EXISTS` → **ปลอดภัยที่จะรันซ้ำ** ไม่ทับข้อมูลเดิม

#### ตัวอย่าง table/column ใหม่ในแต่ละ release

| Release | SQL ที่ต้องรัน |
|---|---|
| Multi-slip upload | `alter table payments add column if not exists slip_urls jsonb default '[]'::jsonb;` |
| Tracking Activities | สร้าง table `tracking_activities` ใหม่ |

**ตรวจสอบ:** ไป **Table Editor** → ควรเห็น table ใหม่ / column ใหม่

---

### ขั้นที่ 2: Push Code ขึ้น GitHub

Vercel ตั้ง **Auto Deploy** ไว้แล้ว — แค่ push code ก็พอ

> ⚠️ **Workflow ปัจจุบันใช้ 2 folders** — `research-management/` (dev) ↔ `research-management-deploy/` (มี git remote ของ Vercel)
>
> โฟลเดอร์ `research-management/.claude/worktrees/...` เป็น worktree ของ Claude Code **ห้ามแก้โค้ดในนั้น** เพราะไม่ได้ถูก sync ขึ้น deploy

#### วิธีที่ 1: Sync จาก dev → deploy folder (workflow ปัจจุบัน)

```bash
# 1. Sync จาก dev → deploy
cd /Users/warut.ch/Documents/ResearchProject/Portfolio
rsync -av --delete \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.env.local' \
  --exclude='.git' \
  --exclude='.DS_Store' \
  research-management/src/ \
  research-management-deploy/src/

rsync -av \
  --exclude='.DS_Store' \
  research-management/supabase/ \
  research-management-deploy/supabase/

cp research-management/package.json research-management-deploy/
cp research-management/package-lock.json research-management-deploy/
cp research-management/next.config.ts research-management-deploy/      # ⬅️ เพิ่มบรรทัดนี้
cp research-management/SETUP.md research-management-deploy/ 2>/dev/null || true

# 2. Verify ว่าการแก้อยู่ใน deploy แล้ว
grep -n "calcRoundedShares\|Coordinator ดูดเศษ" research-management-deploy/src/types/index.ts

# 3. Commit + push
cd research-management-deploy
git status
git diff --stat   # ดู diff สรุป
git add .
git commit -m "อัพเดท <auto fill ยอดเงิน>"
git push
```




> 💡 **เช็คก่อน rsync เสมอ** ว่าการแก้ของคุณอยู่ใน `research-management/src/` จริง — เพราะถ้าเผลอแก้ใน worktree หรือใน deploy โดยตรง rsync `--delete` จะทับทิ้ง

#### วิธีที่ 2: ทำงานใน deploy folder ตรง ๆ (ข้าม dev)

ถ้าแก้เล็กน้อยและไม่อยากใช้ workflow 2 folders:

```bash
cd /Users/warut.ch/Documents/ResearchProject/Portfolio/research-management-deploy

# แก้ code...
git add .
git commit -m "fix: แก้ layout ปุ่ม"
git push
```

> ⚠️ ถ้าใช้วิธีนี้ อย่าลืม sync กลับเข้า dev folder ภายหลัง ไม่งั้นรอบหน้ารัน rsync จะทับทิ้ง

---

### ขั้นที่ 3: ตรวจสถานะ Deploy บน Vercel

1. ไปที่ **https://vercel.com/dashboard**
2. คลิกที่ project `research-management`
3. ดูที่แท็บ **Deployments**:
   - 🟡 **Building** — กำลัง build (~1-2 นาที)
   - 🟢 **Ready** — Deploy สำเร็จ ✅
   - 🔴 **Failed** — คลิกเข้าไปดู error log

4. เมื่อ Ready → คลิก URL → ทดสอบว่าทำงานได้

---

## 📝 Checklist ก่อน Deploy ทุกครั้ง

- [ ] **Build ผ่านบน local** — รัน `npx next build` ดูว่าไม่มี error
- [ ] **ทดสอบใน dev** — รัน `npx next dev` แล้วลองใช้ feature ใหม่
- [ ] **รัน SQL ใน Supabase** (ถ้ามี schema change)
- [ ] **Git status clean** — ไม่มีไฟล์ที่ไม่ต้องการ
- [ ] **Commit message ชัดเจน** — บอกว่าเปลี่ยนอะไร
- [ ] **Push แล้วรอ Vercel build เสร็จ**
- [ ] **เปิด URL production ทดสอบ**

---

## 🔥 Workflow แบบเร็ว (Daily Use)

สำหรับการแก้ไขเล็กๆ น้อยๆ — แก้ใน dev แล้ว sync ขึ้น deploy:

```bash
# 1. แก้ code ใน research-management/src/ ...

# 2. Sync + push (one-liner)
cd /Users/warut.ch/Documents/ResearchProject/Portfolio && \
  rsync -av --delete \
    --exclude='node_modules' --exclude='.next' \
    --exclude='.env.local' --exclude='.git' --exclude='.DS_Store' \
    research-management/src/ research-management-deploy/src/ && \
  cd research-management-deploy && \
  git add . && git commit -m "fix: แก้ layout ปุ่ม" && git push
```

เสร็จ! Vercel จะ deploy ให้อัตโนมัติภายใน 1-2 นาที

---

## 🛠️ กรณีพิเศษ

### เพิ่ม Environment Variable ใหม่

ถ้ามี env var ใหม่ (เช่น API key อื่น):

1. แก้ `.env.local` บน local เพื่อทดสอบ
2. ไป **Vercel Dashboard** → project → **Settings** → **Environment Variables**
3. กด **Add New** → ใส่ Key + Value → กด Save
4. ไปที่ **Deployments** → **"Redeploy"** ล่าสุด → เลือก **"Use existing Build Cache: No"**

### Rollback (คืนค่า version เก่า)

ถ้า deploy ใหม่มีปัญหา ต้องการกลับ version ก่อนหน้า:

1. Vercel Dashboard → **Deployments**
2. หา deployment ที่ **Ready** ที่ทำงานได้ดี (เก่ากว่า)
3. คลิก **"⋯"** → **"Promote to Production"**
4. Confirm → Production URL จะชี้กลับไป version เก่าทันที

### Build Failed

1. คลิกเข้า deployment ที่ Failed
2. ดู tab **Build Logs** → หา error message
3. แก้ไขใน local → push ใหม่
4. **สาเหตุที่พบบ่อย:**
   - TypeScript error → แก้ type
   - Missing environment variable → เพิ่มใน Vercel Settings
   - Dependency ที่หายไป → `npm install <pkg>` แล้ว commit `package.json`

### ดึงข้อมูลจาก Supabase Production

บางทีต้องการดู/แก้ข้อมูลจริงใน production:

1. Supabase Dashboard → **Table Editor**
2. แก้ไข row ได้โดยตรง
3. Refresh web app → เห็นการเปลี่ยนแปลงทันที

---

## 📦 ไฟล์สำคัญที่ต้องมีใน Git

```
✅ src/                  # Source code
✅ public/               # Static assets
✅ supabase/             # SQL schema
✅ package.json
✅ package-lock.json
✅ tsconfig.json
✅ next.config.ts
✅ postcss.config.mjs
✅ eslint.config.mjs
✅ next-env.d.ts
✅ .gitignore
✅ README.md
✅ SETUP.md              # คู่มือ setup ครั้งแรก
✅ DEPLOY.md             # คู่มือนี้
```

## 🚫 ไฟล์ที่ไม่ควรอยู่ใน Git

```
❌ .env.local            # มี API keys sensitive
❌ node_modules/         # ไฟล์ dependencies
❌ .next/                # Build output
❌ .DS_Store             # Mac system file
```

ทั้งหมดนี้อยู่ใน `.gitignore` แล้ว ✅

---

## 🎯 Quick Reference

| สิ่งที่ต้องทำ | คำสั่ง / ที่ทำ |
|---|---|
| Deploy code ใหม่ | `rsync ... && cd .../research-management-deploy && git add . && git commit && git push` |
| อัพเดท DB schema | Supabase → SQL Editor → รัน `supabase/schema.sql` |
| เปลี่ยน env var | Vercel → Settings → Environment Variables |
| ดู build logs | Vercel → Deployments → คลิก deployment |
| Rollback | Vercel → Deployments → Promote to Production (version เก่า) |
| ดูข้อมูล DB | Supabase → Table Editor |
| Test local | `cd research-management && npx next dev` → http://localhost:3000 |
| Build local | `cd research-management && npx next build` |

---

## 💡 Tips

1. **Preview URL ก่อน Merge** — ทุก push ไป branch อื่น (ไม่ใช่ main) Vercel จะสร้าง Preview URL ให้ทดลองก่อน deploy จริง
2. **Commit บ่อยๆ** — ทำให้ rollback ง่าย
3. **SQL Backup** — Supabase free tier มี daily backup (เก็บ 7 วัน) ไม่ต้องกังวลข้อมูลหาย
4. **Export JSON** — ใช้ปุ่มใน sidebar เพื่อ backup เป็นไฟล์ก่อน migrate ใหญ่

---

ถ้าเจอปัญหา deploy ลองดู build logs ใน Vercel ก่อน หรือทดสอบ `npx next build` บน local — จะเห็น error ที่ตรงกันครับ ✨


เปิด server
cd /Users/warut.ch/Documents/ResearchProject/Portfolio/research-management && npx next dev

ปิด server
กด Ctrl + C


Username:admin@research.com
Password:research1234


