# 🚀 Setup Guide — Research Management System

คู่มือ setup ระบบให้ทีม 3 คนใช้งานร่วมกัน

---

## 📋 Overview

ระบบใช้ **Supabase** (ฟรี) เป็น backend สำหรับ:
- 🗄️ **Database** (PostgreSQL) — เก็บโครงการ, การชำระเงิน, ใบเสนอราคา ฯลฯ
- 🔐 **Authentication** — Login ด้วย email/password
- ☁️ **Sync ทุก device** — แก้ที่ใดเห็นทุกที่

---

## ขั้นตอนที่ 1: สมัคร Supabase

1. ไปที่ **https://supabase.com** → กด "Start your project"
2. Sign up ด้วย GitHub หรือ email (ฟรี)
3. กด **"New Project"**:
   - **Name:** `research-management`
   - **Database Password:** ตั้งรหัสผ่าน (จดไว้)
   Current pass: VkvMbmNwrPCjjYaE
   - **Region:** Singapore (ใกล้ไทยที่สุด)
4. รอ 1-2 นาทีให้ Supabase สร้าง project

---

## ขั้นตอนที่ 2: สร้าง Tables ใน Supabase

1. ใน Supabase Dashboard → **SQL Editor** (เมนูซ้าย)
2. กด **"New query"**
3. เปิดไฟล์ `supabase/schema.sql` ในโปรเจค → คัดลอกเนื้อหาทั้งหมด
4. วางใน SQL Editor → กด **"Run"** (มุมขวาล่าง)
5. ✅ ควรขึ้น "Success. No rows returned"

ตรวจสอบ: ไปที่ **Table Editor** ควรเห็น 4 tables: `projects`, `payments`, `distributions`, `quotations`

---

## ขั้นตอนที่ 3: สร้าง User Account สำหรับทีม

1. ใน Supabase Dashboard → **Authentication** → **Users**
2. กด **"Add user"** → **"Create new user"**
3. สร้าง 3 บัญชี:
   - `tangmo@research.com` + password
   - `frank@research.com` + password
   - `ton@research.com` + password
4. ✅ กด **"Auto Confirm User"** เพื่อไม่ต้อง verify email

> 💡 ใช้ email อะไรก็ได้ ไม่จำเป็นต้องเป็นอีเมลจริง

---

## ขั้นตอนที่ 4: Copy API Keys

1. ใน Supabase Dashboard → **Settings** → **API**
2. คัดลอก 2 ค่า:
   - **Project URL** (เช่น `https://abcdef.supabase.co`)
   - **anon public** key (ขึ้นต้นด้วย `eyJ...`)

---

## ขั้นตอนที่ 5: ตั้งค่า Environment Variables

### สำหรับ Local Development

1. ในโฟลเดอร์โปรเจค คัดลอก `.env.local.example` เป็น `.env.local`
2. ใส่ค่าจากขั้นตอนที่ 4:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://abcdef.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

3. รัน:
```bash
npm install
npm run dev
```

4. เปิด http://localhost:3000 → จะเห็นหน้า Login

---

## ขั้นตอนที่ 6: Deploy ขึ้น Vercel (ฟรี)

### 6.1 Push code ขึ้น GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/research-management.git
git push -u origin main
```

### 6.2 Deploy บน Vercel

1. ไปที่ **https://vercel.com** → Login ด้วย GitHub
2. กด **"Add New..."** → **"Project"**
3. เลือก repository → **Import**
4. **Environment Variables** — ใส่:
   - `NEXT_PUBLIC_SUPABASE_URL` = (จากขั้นที่ 4)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (จากขั้นที่ 4)
5. กด **"Deploy"** → รอ 1-2 นาที
6. ✅ ได้ URL เช่น `https://research-management-xxx.vercel.app`

---

## ขั้นตอนที่ 7: Migrate ข้อมูลเก่า (ถ้ามี)

ถ้ามีข้อมูลเก่าใน LocalStorage:

1. **Login** เข้าระบบบน browser ที่มีข้อมูลเดิม
2. ในเมนู Sidebar กดปุ่ม **☁️ ย้ายข้อมูลขึ้น Cloud**
3. ยืนยัน → รอจนเสร็จ → ข้อมูลจะถูก upload ไป Supabase
4. ตรวจสอบใน Supabase Table Editor

---

## ✅ ตรวจสอบว่าใช้งานได้

1. เปิด `http://localhost:3000` (หรือ Vercel URL)
2. Login ด้วยบัญชีที่สร้าง
3. ลองสร้างโครงการใหม่
4. เปิด browser อื่น (Incognito) → Login ด้วยบัญชีอื่น
5. ✅ ควรเห็นโครงการเดียวกัน

---

## ❓ FAQ

### ข้อมูลของฉันจะปลอดภัยไหม?
- Supabase ใช้ PostgreSQL + Row Level Security (RLS)
- เฉพาะ user ที่ login เท่านั้นที่เข้าถึงข้อมูลได้
- ทุกการเชื่อมต่อใช้ HTTPS

### ราคา?
- **Free tier**: 500MB database + 1GB storage + 2GB bandwidth/month — เพียงพอสำหรับทีมเล็ก
- ถ้าเกิน → $25/month (Pro plan)

### เปลี่ยน password ทำยังไง?
- Supabase Dashboard → Authentication → Users → คลิก user → Reset password

### ลืม password?
- เรียก admin (เจ้าของ Supabase project) reset ให้

### ถ้า Supabase ล่ม?
- ใช้ปุ่ม **Export JSON** ใน sidebar เพื่อ backup เป็นไฟล์
- ระบบจะใช้ไม่ได้จนกว่า Supabase จะกลับมา

---

## 🎉 เสร็จสิ้น!

ตอนนี้ทีมสามารถใช้งานร่วมกันได้แล้ว ทุกการเปลี่ยนแปลงจะ sync ไปทุก device อัตโนมัติ
