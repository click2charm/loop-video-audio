let videoFiles=[], audioFiles=[], outputPath=null, logoPath=null;

const sel = document.getElementById('sel');
const log = document.getElementById('log');
const logoSel = document.getElementById('logoSel');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const progressStatus = document.getElementById('progressStatus');

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
    }, 2000);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  console.log('[Renderer] DOM loaded');

  const licenseOverlay = document.getElementById('licenseOverlay');
  const licenseStatusEl = document.getElementById('licenseStatus');
  const licenseButton = document.getElementById('manageLicenseBtn');

  // Check license status (non-blocking)
  async function checkLicenseStatus() {
    console.log('[Renderer] Checking license status...');
    try {
      const licenseStatus = await window.api.checkLicense();
      console.log('[Renderer] License status:', licenseStatus);

      // Always allow use - just show status
      if (licenseStatus.isTrial && licenseStatus.isValid) {
        // Trial mode - show days remaining
        appendLog(`✅ ทดลองใช้งาน: เหลืออีก ${licenseStatus.daysRemaining} วัน (หมดอายุ: ${licenseStatus.expiryDate})`);
        if (licenseButton) {
          licenseButton.textContent = `🔑 License (Trial: ${licenseStatus.daysRemaining} วัน)`;
        }
      } else if (licenseStatus.isTrial && !licenseStatus.isValid) {
        // Trial expired
        appendLog(`⚠️ ทดลองใช้งานหมดอายุแล้ว - กรุณาเปิดใช้งาน License`);
        if (licenseButton) {
          licenseButton.textContent = '🔑 Trial หมดอายุ - เปิดใช้งาน';
        }
      } else if (licenseStatus.isLifetime) {
        // Licensed
        appendLog(`✅ License: ตลอดชีพ (Lifetime)`);
        if (licenseButton) {
          licenseButton.textContent = '🔑 License: Lifetime';
        }
      }

      return licenseStatus;
    } catch (err) {
      console.error('[Renderer] Failed to check license:', err);
      appendLog('⚠️ ไม่สามารถตรวจสอบ license ได้ - ใช้งานแบบ offline');
      return { isValid: true, isTrial: true };
    }
  }

  // Check license on start (non-blocking)
  await checkLicenseStatus();

  // License button - open dialog
  if (licenseButton) {
    licenseButton.addEventListener('click', () => {
      console.log('[Renderer] Opening license dialog');
      licenseOverlay.style.display = 'flex';

      // Show current status
      checkLicenseStatus().then(status => {
        if (status.isTrial && status.isValid) {
          licenseStatusEl.innerHTML = `<p style="color:#4299e1;">ℹ️ ทดลองใช้งาน: เหลืออีก ${status.daysRemaining} วัน</p>`;
        } else if (status.isTrial && !status.isValid) {
          licenseStatusEl.innerHTML = `<p style="color:#f5576c; font-weight:600;">⚠️ ทดลองใช้งานหมดอายุแล้ว</p>`;
        } else if (status.isLifetime) {
          licenseStatusEl.innerHTML = `<p style="color:#48bb78; font-weight:600;">✅ License: ตลอดชีพ</p>`;
        }
      });
    });
  }

  // Close license dialog
  const closeButton = document.getElementById('closeLicenseDialog');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      licenseOverlay.style.display = 'none';
    });
  }

  // Activate license button
  document.getElementById('activateButton').addEventListener('click', async () => {
    const licenseKey = document.getElementById('licenseKeyInput').value.trim();
    const errorEl = document.getElementById('licenseError');
    const activateBtn = document.getElementById('activateButton');

    console.log('[Renderer] Attempting to activate license');

    if (!licenseKey) {
      errorEl.textContent = 'กรุณากรอก License Key';
      console.error('[Renderer] Empty license key');
      return;
    }

    activateBtn.disabled = true;
    activateBtn.textContent = 'กำลังเปิดใช้งาน...';
    errorEl.textContent = '';

    try {
      console.log('[Renderer] Calling activate-license IPC...');
      const result = await window.api.activateLicense(licenseKey);
      console.log('[Renderer] Activation result:', result);

      if (result.valid) {
        licenseStatusEl.innerHTML = '<p style="color:#48bb78; font-weight:600;">✅ เปิดใช้งาน license สำเร็จ!</p>';
        appendLog('✅ เปิดใช้งาน license สำเร็จ: ตลอดชีพ (Lifetime)');

        console.log('[Renderer] License activated successfully');

        setTimeout(() => {
          licenseOverlay.style.display = 'none';
          checkLicenseStatus(); // Refresh status
        }, 2000);
      } else {
        errorEl.textContent = result.error || 'ไม่สามารถเปิดใช้งาน license ได้';
        console.error('[Renderer] Activation failed:', result.error);
      }
    } catch (err) {
      errorEl.textContent = 'เกิดข้อผิดพลาด: ' + err.message;
      console.error('[Renderer] Activation error:', err);
    } finally {
      activateBtn.disabled = false;
      activateBtn.textContent = 'เปิดใช้งาน License';
    }
  });

  // Video file picker
  document.getElementById('btnVideo').addEventListener('click', async () => {
    videoFiles = await window.api.pickVideo();
    renderSel();
    if(videoFiles.length) appendLog(`เลือกวิดีโอ/รูปภาพ: ${videoFiles.length} ไฟล์`);
  });

  // Audio file picker
  document.getElementById('btnAudios').addEventListener('click', async () => {
    audioFiles = await window.api.pickAudios();
    renderSel();
    if(audioFiles.length) appendLog(`เลือกเสียง: ${audioFiles.length} ไฟล์`);
  });

  // Output file picker
  document.getElementById('btnOut').addEventListener('click', async () => {
    outputPath = await window.api.pickOutput();
    renderSel();
    if(outputPath) appendLog(`ที่เก็บผลลัพธ์: ${outputPath}`);
  });

  // Logo picker
  document.getElementById('btnPickLogo').addEventListener('click', async () => {
    logoPath = await window.api.pickLogo();
    if(logoPath) {
      logoSel.textContent = logoPath;
      appendLog(`เลือกโลโก้: ${logoPath}`);
    }
  });

  // Clear logo button
  document.getElementById('btnClearLogo').addEventListener('click', () => {
    logoPath = null;
    logoSel.textContent = '(ไม่ได้เลือก)';
    appendLog('ลบโลโก้แล้ว');
  });

  // FFmpeg logs
  window.api.onFFmpegLog((line) => {
    log.textContent += line;
    log.scrollTop = log.scrollHeight;
  });

  // Progress updates
  window.api.onProgress(updateProgress);

  // Run button
  document.getElementById('btnRun').addEventListener('click', async () => {
    const outputFormat = document.getElementById('outputFormat').value;
    const videoQuality = document.getElementById('videoQuality').value;
    const centerMode = document.getElementById('centerMode').checked;
    const textBackground = document.getElementById('textBackground').checked;

    const titleText = document.getElementById('titleText').value;
    const titleSize = parseInt(document.getElementById('titleSize').value, 10);
    const subtitleText = document.getElementById('subtitleText').value;
    const subtitleSize = parseInt(document.getElementById('subtitleSize').value, 10);
    const taglineText = document.getElementById('taglineText').value;
    const taglineSize = parseInt(document.getElementById('taglineSize').value, 10);

    const overlayText = document.getElementById('overlayText').value;
    const textPos = document.getElementById('textPos').value;
    const fontSize = parseInt(document.getElementById('fontSize').value, 10);

    const logoScale = parseFloat(document.getElementById('logoScale').value);
    const logoOpacity = parseFloat(document.getElementById('logoOpacity').value);
    const logoPos = document.getElementById('logoPos').value;

    if(!videoFiles.length || !audioFiles.length || !outputPath){
      alert('กรุณาเลือกไฟล์วิดีโอ/รูปภาพ, เสียง, และที่เก็บผลลัพธ์');
      return;
    }

    appendLog('เริ่มประมวลผล...');

    const result = await window.api.mergeAndLoop({
      videoFiles, audioFiles, outputPath,
      outputFormat, videoQuality,
      centerMode, textBackground,
      titleText, titleSize,
      subtitleText, subtitleSize,
      taglineText, taglineSize,
      overlayText, textPos, fontSize,
      logoPath, logoScale, logoOpacity, logoPos
    });

    if(result.ok){
      appendLog('✅ เสร็จสิ้น! ไฟล์: '+outputPath);
      alert('เสร็จสิ้น!\n'+outputPath);
    } else {
      appendLog('❌ ผิดพลาด: '+result.error);
      alert('ผิดพลาด:\n'+result.error);
    }
  });
});
