# Research Management System

ระบบบริหารจัดการบริษัทรับทำวิจัย — รองรับทีมทำงานร่วมกันผ่าน Supabase Backend

## Features

- 🔐 **Login** ด้วย email/password (Supabase Auth)
- ☁️ **Cloud Sync** — ทีมเห็นข้อมูลเดียวกันทุก device
- 📊 **Dashboard** — ภาพรวมโครงการ + รายได้
- 📁 **โครงการ** — Excel-style tabs จัดการกิจกรรม, งวดเงิน, การชำระเงิน, การโอนเงินให้สมาชิก
- 💰 **รายได้** — รับจริง vs คาดว่าจะได้ แยกตามคน
- 📄 **ใบเสนอราคา** — สร้าง + Export PDF (รองรับภาษาไทย)
- 💸 **ประวัติการชำระเงิน** — รายการชำระจากลูกค้าทั้งหมด
- 💾 **Backup/Restore** — Export/Import JSON
- 🔄 **Migrate** — ย้ายข้อมูลเก่าจาก LocalStorage ไป Cloud

## Tech Stack

- **Framework:** Next.js 16 + TypeScript
- **Styling:** Tailwind CSS
- **State:** Zustand
- **Backend:** Supabase (PostgreSQL + Auth)
- **Charts:** Recharts
- **PDF:** jsPDF + Sarabun font

## 🚀 Quick Start

ดูคู่มือเต็มที่ **[SETUP.md](./SETUP.md)**

```bash
# 1. Install
npm install

# 2. Copy environment template
cp .env.local.example .env.local
# แก้ไข .env.local ใส่ค่า Supabase URL + anon key

# 3. Run dev server
npm run dev
```

เปิด http://localhost:3000

## 📦 Build & Deploy

```bash
npm run build
npm start
```

แนะนำ deploy บน **[Vercel](https://vercel.com)** — รองรับ Next.js โดยตรง + ฟรี

## 📁 Project Structure

```
src/
├── app/                    # Next.js pages (App Router)
│   ├── page.tsx            # Dashboard
│   ├── projects/page.tsx   # โครงการ (Excel-style tabs)
│   ├── income/page.tsx     # รายได้
│   ├── quotations/page.tsx # ใบเสนอราคา
│   ├── payments/page.tsx   # ประวัติการชำระเงิน
│   └── login/page.tsx      # หน้า Login
├── components/
│   ├── AppShell.tsx        # Layout wrapper
│   ├── AuthGuard.tsx       # Auth protection
│   └── Sidebar.tsx         # เมนูซ้าย
├── lib/
│   ├── supabase.ts         # Supabase client
│   ├── supabaseSync.ts     # DB ↔ TS converters
│   ├── auth.ts             # Auth helpers
│   ├── generatePdf.ts      # PDF generator
│   ├── thaiFont.ts         # Sarabun font (base64)
│   ├── useHydrated.ts      # Hydration helper
│   └── utils.ts            # Format helpers
├── store/
│   └── useStore.ts         # Zustand + Supabase sync
└── types/
    └── index.ts            # TypeScript types

supabase/
└── schema.sql              # Database schema
```

## License

Private — internal use only
