#!/usr/bin/env node

/**
 * Online License Key Generator with Firebase
 * สร้าง license keys ล่วงหน้าและอัปโหลดไป Firebase Realtime Database
 *
 * วิธีใช้งาน:
 * 1. สร้าง Firebase project ที่ https://console.firebase.google.com
 * 2. เปิดใช้งาน Realtime Database
 * 3. ดาวน์โหลด Service Account Key (Settings > Service Accounts)
 * 4. บันทึกเป็น firebase-admin-key.json
 * 5. รัน: node generate-licenses.js [จำนวน]
 *
 * ตัวอย่าง:
 * node generate-licenses.js 5000
 */

const crypto = require('crypto');
const fs = require('fs');

// Secret key สำหรับ sign license keys
const LICENSE_SECRET = 'YOUR-SECRET-KEY-CHANGE-THIS-2024';

// สร้าง license key
function generateLicenseKey() {
  // สร้าง random 20 characters (A-Z, 0-9)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomPart = '';
  for (let i = 0; i < 20; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // สร้าง signature (HMAC-SHA256)
  const hmac = crypto.createHmac('sha256', LICENSE_SECRET);
  hmac.update(randomPart);
  const signature = hmac.digest('hex').substring(0, 4).toUpperCase();

  // รวมเป็น: RANDOMPART + SIGNATURE
  const fullKey = randomPart + signature;

  // Format: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (24 chars + 5 dashes = 29 chars)
  return fullKey.match(/.{1,4}/g).join('-');
}

// ตรวจสอบว่า license key ถูกต้องหรือไม่
function validateLicenseKeyFormat(licenseKey) {
  const clean = licenseKey.replace(/-/g, '');

  if (clean.length !== 24) {
    return false;
  }

  const randomPart = clean.substring(0, 20);
  const providedSignature = clean.substring(20, 24);

  // คำนวณ signature ใหม่
  const hmac = crypto.createHmac('sha256', LICENSE_SECRET);
  hmac.update(randomPart);
  const expectedSignature = hmac.digest('hex').substring(0, 4).toUpperCase();

  return providedSignature === expectedSignature;
}

// สร้าง license keys
function generateMultipleLicenses(count) {
  const licenses = {};
  const uniqueKeys = new Set();

  console.log(`กำลังสร้าง ${count} license keys...`);

  while (Object.keys(licenses).length < count) {
    const key = generateLicenseKey();

    // ตรวจสอบว่าไม่ซ้ำ
    if (!uniqueKeys.has(key)) {
      uniqueKeys.add(key);

      // Format สำหรับ Firebase
      licenses[key.replace(/-/g, '_')] = {
        status: 'available', // available, activated
        created: new Date().toISOString(),
        activated: null,
        machineId: null,
        machineName: null,
        lastCheck: null
      };

      // แสดงความคืบหน้าทุก 500 keys
      if (Object.keys(licenses).length % 500 === 0) {
        console.log(`  สร้างแล้ว ${Object.keys(licenses).length}/${count} keys...`);
      }
    }
  }

  console.log(`✅ สร้าง license keys เสร็จสมบูรณ์: ${Object.keys(licenses).length} keys`);

  return licenses;
}

// อัปโหลดไป Firebase
async function uploadToFirebase(licenses) {
  try {
    // ตรวจสอบว่ามี firebase-admin-key.json หรือไม่
    if (!fs.existsSync('firebase-admin-key.json')) {
      console.log('');
      console.log('⚠️  ไม่พบไฟล์ firebase-admin-key.json');
      console.log('');
      console.log('วิธีสร้าง Firebase Service Account Key:');
      console.log('1. ไปที่ https://console.firebase.google.com');
      console.log('2. เลือก Project');
      console.log('3. ไปที่ Settings > Service Accounts');
      console.log('4. คลิก "Generate New Private Key"');
      console.log('5. บันทึกไฟล์เป็น firebase-admin-key.json');
      console.log('');
      return false;
    }

    const admin = require('firebase-admin');
    const serviceAccount = require('./firebase-admin-key.json');

    // Initialize Firebase Admin
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: serviceAccount.databaseURL || `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`
    });

    const db = admin.database();
    const ref = db.ref('licenses');

    console.log('');
    console.log('กำลังอัปโหลดไป Firebase...');

    // อัปโหลดทีละ batch (500 keys ต่อครั้ง)
    const keys = Object.keys(licenses);
    const batchSize = 500;

    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      const batchData = {};

      batch.forEach(key => {
        batchData[key] = licenses[key];
      });

      await ref.update(batchData);
      console.log(`  อัปโหลดแล้ว ${Math.min(i + batchSize, keys.length)}/${keys.length} keys...`);
    }

    console.log('');
    console.log('✅ อัปโหลดสำเร็จ!');
    console.log('');

    await admin.app().delete();
    return true;

  } catch (error) {
    console.error('');
    console.error('❌ เกิดข้อผิดพลาดในการอัปโหลด:', error.message);
    console.error('');
    return false;
  }
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const count = parseInt(args[0]) || 5000;

  console.log('='.repeat(60));
  console.log('Online License Key Generator for Loop Video to Audio');
  console.log('='.repeat(60));
  console.log();

  // สร้าง license keys
  const licenses = generateMultipleLicenses(count);

  // บันทึกเป็น JSON (backup)
  const outputPath = 'license_keys.json';
  const data = {
    generated: new Date().toISOString(),
    total: Object.keys(licenses).length,
    licenses: licenses
  };

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
  console.log();
  console.log(`📁 Backup บันทึกไว้ที่: ${outputPath}`);
  console.log();

  // ทดสอบ validation
  console.log('กำลังทดสอบ validation...');
  const testKey = Object.keys(licenses)[0].replace(/_/g, '-');
  const isValid = validateLicenseKeyFormat(testKey);
  console.log(`  Test key: ${testKey}`);
  console.log(`  Valid: ${isValid ? '✅' : '❌'}`);
  console.log();

  // อัปโหลดไป Firebase
  const uploaded = await uploadToFirebase(licenses);

  // สรุป
  console.log('='.repeat(60));
  console.log('สรุป:');
  console.log(`  - จำนวน license keys: ${Object.keys(licenses).length}`);
  console.log(`  - ไฟล์ backup: ${outputPath}`);
  console.log(`  - อัปโหลด Firebase: ${uploaded ? '✅ สำเร็จ' : '❌ ล้มเหลว'}`);
  console.log();

  if (uploaded) {
    console.log('ขั้นตอนต่อไป:');
    console.log('  1. ตั้งค่า Firebase Security Rules (ใน Firebase Console)');
    console.log('  2. Update Firebase config ใน license.js');
    console.log('  3. ทดสอบการ activate license');
    console.log();
    console.log('Firebase Security Rules (แนะนำ):');
    console.log('{');
    console.log('  "rules": {');
    console.log('    "licenses": {');
    console.log('      ".read": true,');
    console.log('      "$licenseKey": {');
    console.log('        ".write": "!data.exists() || data.child(\'status\').val() === \'available\'"');
    console.log('      }');
    console.log('    }');
    console.log('  }');
    console.log('}');
  } else {
    console.log('หากต้องการอัปโหลดในภายหลัง:');
    console.log('  1. สร้าง firebase-admin-key.json');
    console.log('  2. รันคำสั่ง: node generate-licenses.js 0');
    console.log('     (จะอ่านจาก license_keys.json และอัปโหลด)');
  }

  console.log('='.repeat(60));
}

// เรียกใช้งาน
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  generateLicenseKey,
  validateLicenseKeyFormat,
  generateMultipleLicenses
};
