let videoPath=null, audioFiles=[], outputPath=null, logoPath=null;

const sel = document.getElementById('sel');
const log = document.getElementById('log');
const logoSel = document.getElementById('logoSel');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const progressStatus = document.getElementById('progressStatus');

function renderSel(){
  sel.textContent = JSON.stringify({ videoPath, audioFiles, outputPath, logoPath }, null, 2);
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
  videoPath = await window.api.pickVideo();
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
  if(!videoPath || !outputPath || !audioFiles.length){
    appendLog('กรุณาเลือกไฟล์ให้ครบ (วิดีโอ/รูปภาพ, เสียง, ผลลัพธ์)');
    return;
  }
  const payload = {
    videoPath,
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
