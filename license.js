const crypto = require('crypto');
const os = require('os');
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// Secret key for license encryption (เปลี่ยนเป็นของคุณเอง!)
const LICENSE_SECRET = 'YOUR-SECRET-KEY-CHANGE-THIS-2024';

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

// Generate license key (for your internal use to create licenses)
function generateLicenseKey(machineId, expiryDays = 365) {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + expiryDays);
  const expiryTimestamp = expiryDate.getTime();

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

    // Check expiry
    if (parseInt(expiryTimestamp) < currentTime) {
      return { valid: false, error: 'License key หมดอายุแล้ว' };
    }

    const expiryDate = new Date(parseInt(expiryTimestamp));
    return {
      valid: true,
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

// Check if app is licensed
function checkLicense() {
  const licenseKey = loadLicense();
  if (!licenseKey) {
    return { valid: false, error: 'ไม่พบ License key กรุณาติดต่อผู้พัฒนาเพื่อขอ license' };
  }
  return validateLicenseKey(licenseKey);
}

module.exports = {
  getMachineId,
  generateLicenseKey,
  validateLicenseKey,
  saveLicense,
  loadLicense,
  checkLicense
};
