# 🔬 Research Management System

ระบบจัดการโครงการวิจัยและการเงินสำหรับทีมวิจัย — ติดตามโครงการ, งวดการชำระเงิน, การแบ่งเงินให้สมาชิก, เงินกองกลาง และออกใบเสนอราคา พร้อม sync ข้อมูลข้ามอุปกรณ์ผ่าน Supabase

---

## ✨ Features

| หน้า | ทำอะไร |
|------|--------|
| **Dashboard** | ภาพรวมโครงการ รายได้ และสถานะการเงิน |
| **โครงการ** | จัดการโครงการวิจัย — กิจกรรม, งวดเงิน, การชำระเงิน, การโอนเงินให้สมาชิก |
| **รายได้** | สรุปส่วนแบ่งรายสมาชิก + โอนยอดคงค้าง (รายโครงการ / โอนทั้งหมด) |
| **ใบเสนอราคา** | สร้าง/พรีวิว/export PDF ใบเสนอราคา |
| **ประวัติการชำระเงิน** | ดูรายการรับเงินทั้งหมด (read-only) |
| **เงินกองกลาง (Pool money)** | รับเข้า/จ่ายออกเงินกองกลาง พร้อมยอดคงเหลือ |
| **Tracking Activities** | ปฏิทินติดตามงานและกำหนดการ |

**ไฮไลต์**
- 🔵 **Edit mode (global)** — ปกติทุกหน้าเป็น read-only, กดปุ่มมุมขวาบนเพื่อเปิดโหมดแก้ไข/ลบ (ป้องกันแก้ผิดพลาด)
- 🔍 **ค้นหา + กรอง** — ค้นชื่อโครงการ/รหัส/**ผู้วิจัย**/สมาชิก, กรองตาม workspace (Doctor/Student), สถานะ, ปี
- 💰 **คำนวณส่วนแบ่งอัตโนมัติ** — แบ่งเงินตาม % รายกิจกรรม (Specialist / Analyst / Coordinator / Manager / Pool / Commission)
- ☁️ **Cloud sync** — แก้ที่ใดเห็นทุกที่ (Supabase) + cache ใน localStorage (paint ทันทีตอน refresh)
- 🔐 **Auth + RLS** — เข้าถึงเฉพาะ user ที่ login, มี Row Level Security รายตาราง

---

## 🛠 Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack) + React 19
- **State:** Zustand 5 (+ persist middleware)
- **Backend:** Supabase (PostgreSQL + Auth + Row Level Security)
- **Styling:** Tailwind CSS 4
- **PDF:** jsPDF + jspdf-autotable
- **Charts:** Recharts
- **Icons:** lucide-react · **Font:** Sarabun

---

## 🚀 Quick Start

```bash
# 1. ติดตั้ง dependencies
npm install

# 2. ตั้งค่า env (ดูรายละเอียดใน SETUP.md)
cp .env.local.example .env.local
#   แล้วใส่ NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_ANON_KEY

# 3. รัน dev server
npm run dev
```

เปิด http://localhost:3000 → หน้า Login

> การตั้งค่า Supabase (สร้าง tables, users, API keys) ครั้งแรก ดูขั้นตอนละเอียดใน **[SETUP.md](SETUP.md)**

---

## 📁 โครงสร้างโปรเจกต์

```
src/
├─ app/                    # หน้าเว็บ (App Router)
│  ├─ page.tsx             # Dashboard
│  ├─ projects/            # โครงการ
│  ├─ income/              # รายได้ / โอนเงินสมาชิก
│  ├─ quotations/          # ใบเสนอราคา
│  ├─ payments/            # ประวัติการชำระเงิน
│  ├─ pool/                # เงินกองกลาง
│  ├─ tracking/            # Tracking Activities
│  └─ login/               # หน้าเข้าสู่ระบบ
├─ components/             # AppShell, Sidebar, Modal, CalendarView ฯลฯ
├─ store/useStore.ts       # Zustand store (data + filters + editMode)
├─ lib/                    # supabase client, utils, generatePdf
└─ types/index.ts          # types + logic คำนวณส่วนแบ่ง

supabase/
├─ schema.sql              # สร้าง tables + RLS policies (รันครั้งแรก)
└─ fix_rls_always_true.sql # migration ปรับ RLS ให้ปลอดภัยขึ้น
```

**Scripts:** `npm run dev` · `npm run build` · `npm run start` · `npm run lint`

---

## 📚 เอกสารเพิ่มเติม

- **[SETUP.md](SETUP.md)** — ตั้งค่า Supabase + env ครั้งแรก
- **[DEPLOY.md](DEPLOY.md)** — deploy ขึ้น Vercel (workflow 2 folders)
