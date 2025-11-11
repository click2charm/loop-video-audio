#!/usr/bin/env node

/**
 * Upload existing license_keys.json to Firebase
 * Simple one-command upload
 */

const https = require('https');
const fs = require('fs');

// Load license keys
const licenseData = JSON.parse(fs.readFileSync('license_keys.json', 'utf8'));
const licenses = licenseData.licenses;

// Firebase config
const PROJECT_ID = 'loop-video-to-audio';
const DB_URL = `https://${PROJECT_ID}-default-rtdb.firebaseio.com`;

// You need to get Web API Key from Firebase Console
// Go to: Project Settings > General > Web API Key
const API_KEY = process.env.FIREBASE_API_KEY || 'YOUR_FIREBASE_WEB_API_KEY';

if (API_KEY === 'YOUR_FIREBASE_WEB_API_KEY') {
  console.error('❌ กรุณาตั้งค่า Firebase Web API Key ก่อน!');
  console.error('');
  console.error('วิธีที่ 1: ส่งผ่าน environment variable:');
  console.error('  export FIREBASE_API_KEY="YOUR_API_KEY"');
  console.error('  node upload-to-firebase.js');
  console.error('');
  console.error('วิธีที่ 2: แก้ไขไฟล์นี้โดยตรง (บรรทัดที่ 18)');
  console.error('');
  console.error('หา API Key ได้ที่:');
  console.error('  Firebase Console > Project Settings > General > Web API Key');
  console.error('');
  process.exit(1);
}

console.log('='.repeat(60));
console.log('Upload License Keys to Firebase');
console.log('='.repeat(60));
console.log();
console.log(`📊 Total keys: ${Object.keys(licenses).length.toLocaleString()}`);
console.log(`🎯 Firebase: ${DB_URL}`);
console.log();

function httpsRequest(url, options = {}, data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = https.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        } else {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(body);
          }
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }

    req.end();
  });
}

async function uploadLicenses() {
  const keys = Object.keys(licenses);
  const batchSize = 100; // Upload 100 keys at a time
  let uploaded = 0;

  console.log('☁️  กำลังอัปโหลดไป Firebase...');
  console.log();

  try {
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      const batchData = {};

      batch.forEach(key => {
        batchData[key] = licenses[key];
      });

      // Upload batch using REST API
      await httpsRequest(
        `${DB_URL}/licenses.json?auth=${API_KEY}`,
        { method: 'PATCH' },
        batchData
      );

      uploaded += batch.length;
      const percent = Math.round((uploaded / keys.length) * 100);

      process.stdout.write(`\r  Progress: ${percent}% (${uploaded.toLocaleString()}/${keys.length.toLocaleString()} keys)`);

      // Rate limiting - don't overwhelm Firebase
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log();
    console.log();
    console.log('✅ อัปโหลดสำเร็จ!');
    console.log();
    console.log('📋 ขั้นตอนต่อไป:');
    console.log('  1. ไปที่ Firebase Console > Realtime Database');
    console.log('  2. ตรวจสอบว่า license keys ถูกอัปโหลดแล้ว');
    console.log('  3. ตั้งค่า Security Rules (ดูด้านล่าง)');
    console.log();
    console.log('🔒 Security Rules (แนะนำ):');
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
    console.log('='.repeat(60));

  } catch (error) {
    console.log();
    console.error();
    console.error('❌ เกิดข้อผิดพลาด:', error.message);
    console.error();

    if (error.message.includes('401') || error.message.includes('Permission denied')) {
      console.error('💡 คำแนะนำ:');
      console.error('  1. ตรวจสอบว่า Firebase Web API Key ถูกต้อง');
      console.error('  2. ไปที่ Firebase Console > Realtime Database > Rules');
      console.error('  3. เปลี่ยน Rules เป็น:');
      console.error('     {');
      console.error('       "rules": {');
      console.error('         ".read": true,');
      console.error('         ".write": true  // ชั่วคราว เพื่ออัปโหลด');
      console.error('       }');
      console.error('     }');
      console.error('  4. อัปโหลดอีกครั้ง');
      console.error('  5. เปลี่ยน Rules กลับเป็นแบบปลอดภัยตามด้านบน');
    }

    process.exit(1);
  }
}

// Run
uploadLicenses().catch(console.error);
