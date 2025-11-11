let videoFiles=[], audioFiles=[], outputPath=null, logoPath=null;

const sel = document.getElementById('sel');
const log = document.getElementById('log');
const logoSel = document.getElementById('logoSel');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const progressStatus = document.getElementById('progressStatus');

// License elements
const licenseOverlay = document.getElementById('licenseOverlay');
const machineIdEl = document.getElementById('machineId');
const licenseStatusEl = document.getElementById('licenseStatus');
const licenseKeyInput = document.getElementById('licenseKeyInput');
const activateButton = document.getElementById('activateButton');
const licenseError = document.getElementById('licenseError');

function renderSel(){
  sel.textContent = JSON.stringify({ videoFiles, audioFiles, outputPath, logoPath }, null, 2);
}
function appendLog(line){
  log.textContent += line + '\n';
  log.scrollTop = log.scrollHeight;
}
function updateProgress(data){
  const { percent = 0, status = '', currentTime = 0, totalDuration = 0 } = data;

  // Show progress container
  progressContainer.style.display = 'block';

  // Update progress bar
  progressBar.style.width = `${percent}%`;
  progressText.textContent = `${percent}%`;

  // Update status message
  let statusMsg = status;
  if (currentTime > 0 && totalDuration > 0) {
    const currentMin = Math.floor(currentTime / 60);
    const currentSec = Math.floor(currentTime % 60);
    const totalMin = Math.floor(totalDuration / 60);
    const totalSec = Math.floor(totalDuration % 60);
    statusMsg += ` (${currentMin}:${currentSec.toString().padStart(2, '0')} / ${totalMin}:${totalSec.toString().padStart(2, '0')})`;
  }
  progressStatus.textContent = statusMsg;

  // Hide progress container if completed
  if (percent >= 100) {
    setTimeout(() => {
      progressContainer.style.display = 'none';
      progressBar.style.width = '0%';
      progressText.textContent = '0%';
      progressStatus.textContent = '';
    }, 3000);
  }
}

document.getElementById('btnVideo').onclick = async ()=>{
  videoFiles = await window.api.pickVideo();
  renderSel();
};
document.getElementById('btnAudios').onclick = async ()=>{
  audioFiles = await window.api.pickAudios();
  renderSel();
};
document.getElementById('btnOut').onclick = async ()=>{
  outputPath = await window.api.pickOutput();
  renderSel();
};
document.getElementById('btnPickLogo').onclick = async ()=>{
  logoPath = await window.api.pickLogo();
  logoSel.textContent = logoPath || '';
  renderSel();
};

document.getElementById('btnRun').onclick = async ()=>{
  if(!videoFiles.length || !outputPath || !audioFiles.length){
    appendLog('กรุณาเลือกไฟล์ให้ครบ (วิดีโอ/รูปภาพ, เสียง, ผลลัพธ์)');
    return;
  }
  const payload = {
    videoFiles,
    audioFiles,
    outputPath,
    outputFormat: document.getElementById('outputFormat').value || 'mp4',
    videoQuality: document.getElementById('videoQuality').value || 'very-high',
    centerMode: document.getElementById('centerMode').checked,
    textBackground: document.getElementById('textBackground').checked,
    titleText: document.getElementById('titleText').value || '',
    titleSize: Number(document.getElementById('titleSize').value) || 64,
    subtitleText: document.getElementById('subtitleText').value || '',
    subtitleSize: Number(document.getElementById('subtitleSize').value) || 48,
    taglineText: document.getElementById('taglineText').value || '',
    taglineSize: Number(document.getElementById('taglineSize').value) || 36,
    overlayText: document.getElementById('txtOverlay').value || '',
    textPos: document.getElementById('textPos').value,
    fontSize: Number(document.getElementById('fontSize').value) || 48,
    logoPath: logoPath || '',
    logoScale: Number(document.getElementById('logoScale').value) || 0.3,
    logoOpacity: Number(document.getElementById('logoOpacity').value) || 0.9,
    logoPos: document.getElementById('logoPos').value
  };

  appendLog('เริ่มประมวลผล...');
  const res = await window.api.mergeAndLoop(payload);
  if(res.ok) appendLog('สำเร็จ ✅');
  else appendLog('ผิดพลาด ❌ ' + res.error);
};

window.api.onFfmpegLog(appendLog);
window.api.onProgress(updateProgress);

// License System - Check on page load
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const licenseStatus = await window.api.checkLicense();
    const machineId = await window.api.getMachineId();

    machineIdEl.textContent = machineId;

    if (!licenseStatus.isValid) {
      // Show license dialog - trial expired or no license
      licenseOverlay.style.display = 'flex';

      if (licenseStatus.isTrial) {
        licenseStatusEl.innerHTML = `<p style="color:#f5576c; font-weight:600;">⚠️ ทดลองใช้งานหมดอายุแล้ว</p>`;
      } else {
        licenseStatusEl.innerHTML = `<p style="color:#f5576c; font-weight:600;">⚠️ ไม่พบ License</p>`;
      }

      // Disable all functionality
      document.getElementById('btnVideo').disabled = true;
      document.getElementById('btnAudios').disabled = true;
      document.getElementById('btnOut').disabled = true;
      document.getElementById('btnRun').disabled = true;
      document.getElementById('btnPickLogo').disabled = true;
    } else {
      // License is valid - hide dialog, show status info
      licenseOverlay.style.display = 'none';

      // Show license info in console or status
      if (licenseStatus.isTrial) {
        appendLog(`✅ ทดลองใช้งาน: เหลืออีก ${licenseStatus.daysRemaining} วัน (หมดอายุ: ${licenseStatus.expiryDate})`);
      } else if (licenseStatus.isLifetime) {
        appendLog(`✅ License: ตลอดชีพ (Lifetime)`);
      } else {
        appendLog(`✅ License: หมดอายุ ${licenseStatus.expiryDate}`);
      }
    }
  } catch (err) {
    console.error('License check error:', err);
    appendLog('⚠️ เกิดข้อผิดพลาดในการตรวจสอบ License');
  }
});

// License activation button handler
activateButton.onclick = async () => {
  const key = licenseKeyInput.value.trim();

  if (!key) {
    licenseError.textContent = '❌ กรุณากรอก License Key';
    return;
  }

  licenseError.textContent = '⏳ กำลังตรวจสอบ...';
  activateButton.disabled = true;

  try {
    const result = await window.api.activateLicense(key);

    if (result.valid) {
      licenseError.style.color = '#4CAF50';
      licenseError.textContent = '✅ เปิดใช้งาน License สำเร็จ!';

      setTimeout(() => {
        licenseOverlay.style.display = 'none';
        location.reload(); // Reload to enable all features
      }, 1500);
    } else {
      licenseError.style.color = '#f5576c';
      licenseError.textContent = '❌ ' + (result.error || 'License Key ไม่ถูกต้อง');
      activateButton.disabled = false;
    }
  } catch (err) {
    licenseError.style.color = '#f5576c';
    licenseError.textContent = '❌ เกิดข้อผิดพลาด: ' + err.message;
    activateButton.disabled = false;
  }
};
