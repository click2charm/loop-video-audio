const crypto = require('crypto');
const os = require('os');
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

// ================== CONFIG ==================
// Secret key สำหรับ validate license signature
const LICENSE_SECRET = 'YOUR-SECRET-KEY-CHANGE-THIS-2024';

// Firebase Realtime Database URL
const FIREBASE_DB_URL = 'https://loop-video-to-audio-default-rtdb.asia-southeast1.firebasedatabase.app';

// Trial settings
const TRIAL_DAYS = 14;

// ============================================

// HTTPS request wrapper
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
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Get unique machine ID
function getMachineId() {
  const hostname = os.hostname();
  const platform = os.platform();
  const arch = os.arch();

  // Create hash from machine info
  const machineInfo = `${hostname}-${platform}-${arch}`;
  const hash = crypto.createHash('sha256').update(machineInfo).digest('hex');
  return hash.substring(0, 16); // First 16 chars
}

// Get machine name for display
function getMachineName() {
  return `${os.hostname()} (${os.platform()})`;
}

// Get or create trial start date
function getTrialStartDate() {
  try {
    const userDataPath = app.getPath('userData');
    const trialPath = path.join(userDataPath, '.trial');

    console.log('[License] Trial path:', trialPath);

    if (fs.existsSync(trialPath)) {
      const data = fs.readFileSync(trialPath, 'utf8');
      const startTime = parseInt(data);
      console.log('[License] Trial started:', new Date(startTime).toLocaleDateString());
      return startTime;
    }
  } catch (err) {
    console.error('[License] Failed to read trial file:', err.message);
  }

  // Create new trial
  const startTime = Date.now();
  try {
    const userDataPath = app.getPath('userData');

    // Ensure directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
      console.log('[License] Created userData directory:', userDataPath);
    }

    const trialPath = path.join(userDataPath, '.trial');
    fs.writeFileSync(trialPath, String(startTime), 'utf8');
    console.log('[License] Created trial file, start date:', new Date(startTime).toLocaleDateString());
  } catch (err) {
    console.error('[License] Failed to create trial file:', err.message);
    console.error('[License] This might be a permission issue. Trial will start from app launch.');
  }
  return startTime;
}

// Check if trial is still valid
function checkTrial() {
  console.log('[License] Checking trial status...');
  const startTime = getTrialStartDate();
  const currentTime = Date.now();
  const daysElapsed = Math.floor((currentTime - startTime) / (1000 * 60 * 60 * 24));
  const daysRemaining = TRIAL_DAYS - daysElapsed;

  const result = {
    isTrial: true,
    isValid: daysRemaining > 0,
    daysRemaining: Math.max(0, daysRemaining),
    expiryDate: new Date(startTime + (TRIAL_DAYS * 24 * 60 * 60 * 1000)).toLocaleDateString('th-TH')
  };

  console.log('[License] Trial status:', result.isValid ? 'Active' : 'Expired', `(${result.daysRemaining} days remaining)`);
  return result;
}

// Validate license key format (signature check)
function validateLicenseKeyFormat(licenseKey) {
  try {
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
  } catch (err) {
    return false;
  }
}

// Fetch license data from Firebase
async function fetchLicenseFromFirebase(licenseKey) {
  try {
    const firebaseKey = licenseKey.replace(/-/g, '_');
    const url = `${FIREBASE_DB_URL}/licenses/${firebaseKey}.json`;

    const data = await httpsRequest(url);

    if (!data || data.error) {
      return { error: 'License key ไม่พบในระบบ' };
    }

    return data;
  } catch (err) {
    return { error: 'ไม่สามารถเชื่อมต่อ server ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต' };
  }
}

// Activate license (bind to machine)
async function activateLicenseOnFirebase(licenseKey, machineId, machineName) {
  try {
    const firebaseKey = licenseKey.replace(/-/g, '_');
    const url = `${FIREBASE_DB_URL}/licenses/${firebaseKey}.json`;

    const updateData = {
      status: 'activated',
      activated: new Date().toISOString(),
      machineId: machineId,
      machineName: machineName,
      lastCheck: new Date().toISOString()
    };

    // Update using PATCH
    const result = await httpsRequest(url, { method: 'PATCH' }, updateData);

    if (result.error) {
      return { error: 'ไม่สามารถเปิดใช้งาน license ได้' };
    }

    return { success: true };
  } catch (err) {
    return { error: 'ไม่สามารถเชื่อมต่อ server ได้' };
  }
}

// Update last check time
async function updateLastCheck(licenseKey) {
  try {
    const firebaseKey = licenseKey.replace(/-/g, '_');
    const url = `${FIREBASE_DB_URL}/licenses/${firebaseKey}/lastCheck.json`;

    await httpsRequest(url, { method: 'PUT' }, new Date().toISOString());
  } catch (err) {
    // Ignore error - not critical
  }
}

// Validate license key (online)
async function validateLicenseKey(licenseKey) {
  try {
    // 1. Check format & signature
    if (!validateLicenseKeyFormat(licenseKey)) {
      return { valid: false, error: 'License key รูปแบบไม่ถูกต้อง' };
    }

    // 2. Fetch from Firebase
    const licenseData = await fetchLicenseFromFirebase(licenseKey);

    if (licenseData.error) {
      return { valid: false, error: licenseData.error };
    }

    // 3. Check status
    if (licenseData.status !== 'available' && licenseData.status !== 'activated') {
      return { valid: false, error: 'License key ถูกยกเลิกแล้ว' };
    }

    const currentMachineId = getMachineId();

    // 4. If already activated, check machine ID
    if (licenseData.status === 'activated') {
      if (licenseData.machineId !== currentMachineId) {
        return {
          valid: false,
          error: `License key ถูกใช้งานแล้วบนเครื่อง: ${licenseData.machineName || 'อื่น'}`
        };
      }

      // Update last check
      await updateLastCheck(licenseKey);

      // Save license locally (in case file was deleted)
      saveLicense(licenseKey);

      return {
        valid: true,
        isLifetime: true,
        machineId: currentMachineId,
        expiryDate: 'ตลอดชีพ (Lifetime)',
        activated: licenseData.activated
      };
    }

    // 5. If available, need to activate first
    if (licenseData.status === 'available') {
      // Activate now
      const activateResult = await activateLicenseOnFirebase(
        licenseKey,
        currentMachineId,
        getMachineName()
      );

      if (activateResult.error) {
        return { valid: false, error: activateResult.error };
      }

      // Save license locally
      saveLicense(licenseKey);

      return {
        valid: true,
        isLifetime: true,
        machineId: currentMachineId,
        expiryDate: 'ตลอดชีพ (Lifetime)',
        justActivated: true
      };
    }

    return { valid: false, error: 'สถานะ license ไม่ถูกต้อง' };

  } catch (err) {
    return { valid: false, error: 'เกิดข้อผิดพลาด: ' + err.message };
  }
}

// Save license to file
function saveLicense(licenseKey) {
  try {
    const userDataPath = app.getPath('userData');
    console.log('[License] Attempting to save license...');
    console.log('[License] userData path:', userDataPath);

    // Ensure directory exists
    if (!fs.existsSync(userDataPath)) {
      console.log('[License] Directory does not exist, creating...');
      fs.mkdirSync(userDataPath, { recursive: true });
      console.log('[License] ✅ Created userData directory');
    } else {
      console.log('[License] Directory already exists');
    }

    // Check write permission
    try {
      fs.accessSync(userDataPath, fs.constants.W_OK);
      console.log('[License] ✅ Directory is writable');
    } catch (permErr) {
      console.error('[License] ❌ Directory is not writable!', permErr.message);
      throw new Error('Permission denied: Cannot write to userData directory');
    }

    const licensePath = path.join(userDataPath, '.license');
    console.log('[License] Writing to:', licensePath);

    fs.writeFileSync(licensePath, licenseKey, 'utf8');
    console.log('[License] ✅ File written successfully');

    // Verify it was saved
    if (fs.existsSync(licensePath)) {
      const saved = fs.readFileSync(licensePath, 'utf8');
      if (saved === licenseKey) {
        console.log('[License] ✅ License file verified successfully');
      } else {
        console.error('[License] ❌ License file content mismatch!');
        console.error('[License] Expected:', licenseKey);
        console.error('[License] Got:', saved);
      }
    } else {
      console.error('[License] ❌ License file was not created!');
    }
  } catch (err) {
    console.error('[License] ❌ Failed to save license:', err.message);
    console.error('[License] Error stack:', err.stack);
    throw err; // Re-throw to let caller know it failed
  }
}

// Load license from file
function loadLicense() {
  try {
    const userDataPath = app.getPath('userData');
    const licensePath = path.join(userDataPath, '.license');
    if (fs.existsSync(licensePath)) {
      const licenseKey = fs.readFileSync(licensePath, 'utf8');
      console.log('[License] Loaded license from file');
      return licenseKey;
    } else {
      console.log('[License] No license file found at:', licensePath);
    }
  } catch (err) {
    console.error('[License] Failed to load license:', err.message);
  }
  return null;
}

// Check if app is licensed (trial or valid license)
async function checkLicense() {
  console.log('[License] Checking license...');
  const licenseKey = loadLicense();

  if (licenseKey) {
    console.log('[License] Found saved license, validating online...');
    // Validate online
    const result = await validateLicenseKey(licenseKey);
    if (result.valid) {
      console.log('[License] License is valid!');
      return result;
    } else {
      console.log('[License] License validation failed:', result.error);
    }
  }

  // No valid license, check trial
  console.log('[License] No valid license, checking trial...');
  return checkTrial();
}

module.exports = {
  getMachineId,
  getMachineName,
  validateLicenseKey,
  saveLicense,
  loadLicense,
  checkLicense,
  checkTrial
};
