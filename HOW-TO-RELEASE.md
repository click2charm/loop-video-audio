# 🚀 วิธีสร้าง Release บน GitHub

## ขั้นตอนที่ 1: Merge Code เข้า Main Branch

```bash
# 1. Pull code ล่าสุด
git pull origin claude/debug-repo-issues-011CUtYtTtwp9LAMWr8Yaeqc

# 2. Switch ไป main
git checkout main

# 3. Pull main ล่าสุด
git pull origin main

# 4. Merge feature branch
git merge claude/debug-repo-issues-011CUtYtTtwp9LAMWr8Yaeqc

# 5. Push ไป main
git push origin main
```

---

## ขั้นตอนที่ 2: สร้าง Release บน GitHub (เลือก 1 วิธี)

### วิธี A: ใช้ GitHub Web UI (ง่ายที่สุด) ⭐

1. ไปที่ https://github.com/click2charm/loop-video-audio
2. คลิกแท็บ **Actions**
3. เลือก workflow **"Build and Release"**
4. คลิกปุ่ม **"Run workflow"** (มุมขวา)
5. กรอก Version: `v1.0.1` (หรือเวอร์ชันที่ต้องการ)
6. คลิก **"Run workflow"**
7. รอ 10-15 นาที (GitHub จะ build macOS + Windows)
8. เสร็จแล้ว! ไปที่ **Releases** จะเห็นไฟล์:
   - `Loop-Video-to-Audio-1.0.1-x64.dmg` (macOS Intel)
   - `Loop-Video-to-Audio-1.0.1-arm64.dmg` (macOS Apple Silicon)
   - `Loop Video to Audio Setup 1.0.1.exe` (Windows)

---

### วิธี B: ใช้ Command Line (สำหรับคนที่ชอบ Terminal)

```bash
# 1. สร้าง tag (ต้องอยู่บน main branch)
git tag -a v1.0.1 -m "Release v1.0.1 - License System + Bug Fixes"

# 2. Push tag ไป GitHub
git push origin v1.0.1

# 3. GitHub Actions จะ build อัตโนมัติ!
# เช็คได้ที่: https://github.com/click2charm/loop-video-audio/actions
```

---

## 📊 ตรวจสอบความคืบหน้า

### ดู Build Status:

1. ไปที่ https://github.com/click2charm/loop-video-audio/actions
2. คลิกที่ workflow run ที่กำลังทำงาน
3. จะเห็น 2 jobs:
   - **build (macos-15)** - สร้าง macOS .dmg
   - **build (windows-latest)** - สร้าง Windows .exe
4. แต่ละ job ใช้เวลาประมาณ 5-10 นาที

### ดาวน์โหลด Release:

1. ไปที่ https://github.com/click2charm/loop-video-audio/releases
2. จะเห็น Release ใหม่ที่สร้าง
3. ดาวน์โหลดไฟล์ที่ต้องการ

---

## 🎯 Version Naming

แนะนำให้ใช้ Semantic Versioning:

- **v1.0.0** - Release แรก
- **v1.0.1** - Bug fix (เช่น แก้ Windows ffprobe)
- **v1.1.0** - Feature ใหม่ (เช่น เพิ่ม License System)
- **v2.0.0** - Breaking changes

**Release นี้แนะนำ:** `v1.1.0` (เพราะมี License System ใหม่)

---

## 📝 Release Notes ตัวอย่าง

```markdown
## Loop Video to Audio v1.1.0

### 🎉 New Features
- ✅ License System with 14-day trial
- ✅ Lifetime license support
- ✅ Machine ID binding (prevents license sharing)
- ✅ Online license validation via Firebase

### 🐛 Bug Fixes
- ✅ Fix Windows ffprobe crash (ENOENT error)
- ✅ Fix multiple video/image concatenation
- ✅ Fix video processing hang for files > 60 minutes
- ✅ Add heartbeat system for long video processing
- ✅ Add warning for videos > 30 minutes

### 📦 Downloads
- **macOS Intel:** Loop-Video-to-Audio-1.1.0-x64.dmg
- **macOS Apple Silicon:** Loop-Video-to-Audio-1.1.0-arm64.dmg
- **Windows:** Loop Video to Audio Setup 1.1.0.exe

### 💰 License
- Free 14-day trial
- Purchase lifetime license at:
  - 📘 Facebook: facebook.com/promptmuseautomate
  - 💬 Line ID: @xmz6911f
```

---

## ⚠️ คำเตือน

### ก่อน Build:

1. ✅ ตรวจสอบว่า Firebase มี license keys แล้ว (10,000 keys)
2. ✅ ตรวจสอบว่า Security Rules ตั้งค่าแล้ว
3. ✅ ทดสอบ license system ใน local ก่อน
4. ✅ Update version ใน `package.json` ถ้าต้องการ

### หลัง Build:

1. ดาวน์โหลดและทดสอบทั้ง 3 ไฟล์
2. ตรวจสอบว่า license system ทำงานถูกต้อง
3. สร้าง License Key สำหรับทดสอบ
4. ทดสอบ activate license

---

## 🔧 แก้ปัญหา

### ปัญหา: Build ล้มเหลว (macOS)

**สาเหตุ:** Missing dependencies

**วิธีแก้:**
- เช็ค build log ใน GitHub Actions
- มักเกิดจาก ffmpeg binaries ไม่ครบ
- Workflow จะ retry อัตโนมัติ

### ปัญหา: Build ล้มเหลว (Windows)

**สาเหตุ:** Python or Node.js version

**วิธีแก้:**
- Workflow ใช้ Node.js 20 (ถูกต้อง)
- ถ้ายังไม่ได้ ดู error log และแก้ไข

### ปัญหา: ไฟล์ใหญ่เกินไป

**ขนาดที่คาดหวัง:**
- macOS .dmg: ~100-150 MB
- Windows .exe: ~100-150 MB

**ถ้าใหญ่กว่านี้:**
- ตรวจสอบว่าไม่ได้ bundle node_modules ที่ไม่จำเป็น
- เช็ค `package.json` → `files` section

---

## ✅ Checklist

- [ ] Merge code เข้า main
- [ ] สร้าง tag/run workflow
- [ ] รอ build เสร็จ (10-15 นาที)
- [ ] ดาวน์โหลดและทดสอบทั้ง 3 ไฟล์
- [ ] ทดสอบ license system
- [ ] แจกจ่าย/ขาย!

---

**หมายเหตุ:** GitHub Actions ฟรี 2,000 นาที/เดือน สำหรับ public repo
แต่ละ build ใช้เวลาประมาณ 20 นาที รวม (macOS + Windows)
คุณสามารถ build ได้ประมาณ 100 ครั้ง/เดือน

---

**อัปเดตล่าสุด:** 2025-11-11
