const crypto = require('crypto');
const os = require('os');
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// Secret key for license encryption (เปลี่ยนเป็นของคุณเอง!)
const LICENSE_SECRET = 'YOUR-SECRET-KEY-CHANGE-THIS-2024';
const TRIAL_DAYS = 14; // Free trial period

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

// Get or create trial start date
function getTrialStartDate() {
  const userDataPath = app.getPath('userData');
  const trialPath = path.join(userDataPath, '.trial');

  try {
    if (fs.existsSync(trialPath)) {
      const data = fs.readFileSync(trialPath, 'utf8');
      return parseInt(data);
    }
  } catch (err) {
    // Ignore error
  }

  // Create new trial
  const startTime = Date.now();
  try {
    fs.writeFileSync(trialPath, String(startTime), 'utf8');
  } catch (err) {
    // Ignore error
  }
  return startTime;
}

// Check if trial is still valid
function checkTrial() {
  const startTime = getTrialStartDate();
  const currentTime = Date.now();
  const daysElapsed = Math.floor((currentTime - startTime) / (1000 * 60 * 60 * 24));
  const daysRemaining = TRIAL_DAYS - daysElapsed;

  return {
    isTrial: true,
    isValid: daysRemaining > 0,
    daysRemaining: Math.max(0, daysRemaining),
    expiryDate: new Date(startTime + (TRIAL_DAYS * 24 * 60 * 60 * 1000)).toLocaleDateString('th-TH')
  };
}

// Generate license key (for your internal use to create licenses)
// Set expiryDays to 0 for lifetime license
function generateLicenseKey(machineId, expiryDays = 0) {
  const expiryTimestamp = expiryDays === 0 ? 0 : (Date.now() + (expiryDays * 24 * 60 * 60 * 1000));
  const data = `${machineId}:${expiryTimestamp}`;
  const cipher = crypto.createCipher('aes-256-cbc', LICENSE_SECRET);
  let encrypted = cipher.update(data, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  return encrypted.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Validate license key
function validateLicenseKey(licenseKey) {
  try {
    // Restore base64 format
    let key = licenseKey.replace(/-/g, '+').replace(/_/g, '/');
    while (key.length % 4 !== 0) {
      key += '=';
    }

    // Decrypt
    const decipher = crypto.createDecipher('aes-256-cbc', LICENSE_SECRET);
    let decrypted = decipher.update(key, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    // Parse data
    const [storedMachineId, expiryTimestamp] = decrypted.split(':');
    const currentMachineId = getMachineId();
    const currentTime = Date.now();

    // Check machine ID match
    if (storedMachineId !== currentMachineId) {
      return { valid: false, error: 'License key ไม่ตรงกับเครื่องนี้' };
    }

    // Check if lifetime license (expiryTimestamp === '0')
    const expiry = parseInt(expiryTimestamp);
    if (expiry === 0) {
      return {
        valid: true,
        isLifetime: true,
        machineId: currentMachineId,
        expiryDate: 'ตลอดชีพ (Lifetime)'
      };
    }

    // Check expiry for time-limited licenses
    if (expiry < currentTime) {
      return { valid: false, error: 'License key หมดอายุแล้ว' };
    }

    const expiryDate = new Date(expiry);
    return {
      valid: true,
      isLifetime: false,
      machineId: currentMachineId,
      expiryDate: expiryDate.toLocaleDateString('th-TH')
    };

  } catch (err) {
    return { valid: false, error: 'License key ไม่ถูกต้อง' };
  }
}

// Save license to file
function saveLicense(licenseKey) {
  const userDataPath = app.getPath('userData');
  const licensePath = path.join(userDataPath, '.license');
  fs.writeFileSync(licensePath, licenseKey, 'utf8');
}

// Load license from file
function loadLicense() {
  try {
    const userDataPath = app.getPath('userData');
    const licensePath = path.join(userDataPath, '.license');
    if (fs.existsSync(licensePath)) {
      return fs.readFileSync(licensePath, 'utf8');
    }
  } catch (err) {
    // Ignore error
  }
  return null;
}

// Check if app is licensed (trial or valid license)
function checkLicense() {
  const licenseKey = loadLicense();

  if (licenseKey) {
    const result = validateLicenseKey(licenseKey);
    if (result.valid) {
      return result;
    }
  }

  // No valid license, check trial
  return checkTrial();
}

module.exports = {
  getMachineId,
  generateLicenseKey,
  validateLicenseKey,
  saveLicense,
  loadLicense,
  checkLicense,
  checkTrial
};

