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

#### วิธีที่ 1: ทำงานใน folder เดียว (แนะนำ)

```bash
cd /Users/warut.ch/Documents/WorkActive/Portfolio/research-management

# 1. ดูว่ามีอะไรเปลี่ยนบ้าง
git status

# 2. Add ไฟล์ทั้งหมด
git add .

# 3. Commit พร้อม message ที่ชัดเจน
git commit -m "feat: เพิ่ม Tracking Activities + multi-slip upload"

# 4. Push
git push
```

#### วิธีที่ 2: Sync จาก dev → deploy folder

ถ้ายังแยก 2 folders:

```bash
# 1. Sync จาก dev → deploy
cd /Users/warut.ch/Documents/WorkActive/Portfolio
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
cp research-management/SETUP.md research-management-deploy/ 2>/dev/null || true

# 2. Commit + push
cd research-management-deploy
git add .
git commit -m "อัพเดท: <ระบุฟีเจอร์ที่เปลี่ยน>"
git push
```

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

สำหรับการแก้ไขเล็กๆ น้อยๆ:

```bash
cd /Users/warut.ch/Documents/WorkActive/Portfolio/research-management

# แก้ code...
git add .
git commit -m "fix: แก้ layout ปุ่ม"
git push
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
| Deploy code ใหม่ | `git add . && git commit -m "..." && git push` |
| อัพเดท DB schema | Supabase → SQL Editor → รัน `supabase/schema.sql` |
| เปลี่ยน env var | Vercel → Settings → Environment Variables |
| ดู build logs | Vercel → Deployments → คลิก deployment |
| Rollback | Vercel → Deployments → Promote to Production (version เก่า) |
| ดูข้อมูล DB | Supabase → Table Editor |
| Test local | `npx next dev` → http://localhost:3000 |
| Build local | `npx next build` |

---

## 💡 Tips

1. **Preview URL ก่อน Merge** — ทุก push ไป branch อื่น (ไม่ใช่ main) Vercel จะสร้าง Preview URL ให้ทดลองก่อน deploy จริง
2. **Commit บ่อยๆ** — ทำให้ rollback ง่าย
3. **SQL Backup** — Supabase free tier มี daily backup (เก็บ 7 วัน) ไม่ต้องกังวลข้อมูลหาย
4. **Export JSON** — ใช้ปุ่มใน sidebar เพื่อ backup เป็นไฟล์ก่อน migrate ใหญ่

---

ถ้าเจอปัญหา deploy ลองดู build logs ใน Vercel ก่อน หรือทดสอบ `npx next build` บน local — จะเห็น error ที่ตรงกันครับ ✨
