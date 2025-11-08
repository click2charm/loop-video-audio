const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

// Determine architecture and paths
const arch = os.arch(); // 'x64' or 'arm64'

// In packaged app, ffmpeg/ffprobe are in Resources folder
// In development, use the npm packages
let ffmpegPath, ffprobePath;

if (app.isPackaged) {
  const resourcesPath = process.resourcesPath;
  const ffmpegFolder = arch === 'arm64' ? 'ffmpeg-arm64' : 'ffmpeg';
  const ffprobeFolder = arch === 'arm64' ? 'ffprobe-arm64' : 'ffprobe';

  ffmpegPath = path.join(resourcesPath, ffmpegFolder, 'ffmpeg');
  ffprobePath = path.join(resourcesPath, ffprobeFolder, 'ffprobe');
} else {
  ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
  ffprobePath = require('@ffprobe-installer/ffprobe').path;
}

// ฟอนต์: แยกไทย/อังกฤษ
// In packaged app, assets are in Resources folder
// In development, assets are in project root
const assetsPath = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(__dirname, 'assets');

const FONT_THAI = path.join(assetsPath, 'NotoSansThai-Regular.ttf');
const FONT_LATIN = path.join(assetsPath, 'NotoSans-Regular.ttf');

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 960, height: 640,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile('renderer.html');
}
app.whenReady().then(createWindow);

// ---------- utils ----------
function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('ไม่พบ ffmpeg-static'));
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    proc.stdout.on('data', d => win?.webContents.send('ffmpeg-log', d.toString()));
    proc.stderr.on('data', d => win?.webContents.send('ffmpeg-log', d.toString()));
    proc.on('error', reject);
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg exited ${code}`)));
  });
}
function posExpr(anchor) {
  const m = 40;
  switch (anchor) {
    case 'tr': return { x: `W-w-${m}`, y: `${m}` };
    case 'tl': return { x: `${m}`, y: `${m}` };
    case 'bl': return { x: `${m}`, y: `H-h-${m}` };
    case 'br': default: return { x: `W-w-${m}`, y: `H-h-${m}` };
  }
}
function escDrawText(s='') {
  return s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\\\'");
}
// ตรวจว่ามีอักษรไทยไหม → ใช้ฟอนต์ไทย ถ้าไม่มีก็ใช้ฟอนต์ละติน
function pickFontForText(text='') {
  const hasThai = /[\u0E00-\u0E7F]/.test(text);
  return hasThai ? FONT_THAI : FONT_LATIN;
}
// --------------------------------

ipcMain.handle('pick-video', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
    filters: [
      { name: 'Video/Image', extensions: ['mp4','mov','mkv','png','jpg','jpeg'] }
    ],
    properties: ['openFile']
  });
  return canceled ? null : filePaths[0];
});
ipcMain.handle('pick-audios', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
    filters: [{ name: 'Audio', extensions: ['mp3','wav','m4a'] }], properties: ['openFile','multiSelections']
  });
  return canceled ? [] : filePaths;
});
ipcMain.handle('pick-output', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow(), {
    filters: [{ name: 'MP4', extensions: ['mp4'] }], defaultPath: 'output.mp4'
  });
  return canceled ? null : filePath;
});
ipcMain.handle('pick-logo', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
    filters: [{ name: 'Image', extensions: ['png','jpg','jpeg'] }], properties: ['openFile']
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('merge-and-loop', async (_e, payload) => {
  try {
    const {
      videoPath, audioFiles, outputPath,
      centerMode = false,
      textBackground = true,
      titleText = '', titleSize = 64,
      subtitleText = '', subtitleSize = 48,
      taglineText = '', taglineSize = 36,
      overlayText = '', textPos = 'br', fontSize = 48,
      logoPath = '', logoScale = 0.3, logoOpacity = 0.9, logoPos = 'br'
    } = payload || {};

    if (!videoPath || !audioFiles?.length || !outputPath) {
      throw new Error('กรุณาเลือกไฟล์ให้ครบ (วิดีโอ/รูปภาพ, เสียง, ผลลัพธ์)');
    }

    const tmp = app.getPath('temp');

    // Check if input is image
    const isImage = /\.(png|jpe?g)$/i.test(videoPath);

    // 1) รวมเสียงถ้ามีหลายไฟล์
    let mergedAudio = audioFiles[0];
    if (audioFiles.length > 1) {
      const listPath = path.join(tmp, `list_${Date.now()}.txt`);
      const content = audioFiles.map(p => `file '${p.replace(/'/g, `'\\''`)}'`).join('\n');
      fs.writeFileSync(listPath, content, 'utf8');
      mergedAudio = path.join(tmp, `merged_${Date.now()}.m4a`);
      await runFFmpeg(['-f','concat','-safe','0','-i', listPath, '-c:a','aac','-b:a','192k', mergedAudio]);
    }

    // 2) ฟิลเตอร์วิดีโอ
    const args = isImage
      ? ['-loop', '1', '-i', videoPath, '-i', mergedAudio]  // For images: loop the image
      : ['-stream_loop', '-1', '-i', videoPath, '-i', mergedAudio];  // For video: loop the video

    let chains = [];
    let videoLabel = '0:v';

    // For images, add fps filter to make it a proper video stream
    if (isImage) {
      chains.push('[0:v]fps=24[v_fps]');
      videoLabel = 'v_fps';
    }

    if (logoPath) args.push('-i', logoPath);

    // โลโก้ (รองรับตำแหน่งใหม่เมื่อ centerMode=true)
    const safeOpacity = Math.max(0, Math.min(1, logoOpacity));
    function logoOverlayChain(inputLabel, outLabel, xExpr, yExpr) {
      return (
        `[2:v]format=rgba,scale=iw*${logoScale}:-1,` +
        `colorchannelmixer=aa=${safeOpacity}[lg];` +
        `[${inputLabel}][lg]overlay=${xExpr}:${yExpr}:format=auto[${outLabel}]`
      );
    }

    if (logoPath) {
      if (centerMode && (logoPos === 'center-before-title' || logoPos === 'center-after-tagline')) {
        // x กลางจอเสมอ
        const cx = `(W-w)/2`;
        // y ประมาณตำแหน่งกลางก่อน/หลังกลุ่มข้อความ (ค่าสัดส่วนปรับให้ลงตัวสวย)
        const cy = (logoPos === 'center-before-title') ? `H*0.22` : `H*0.78`;
        chains.push(logoOverlayChain(videoLabel, 'vo_logo_center', cx, cy));
        videoLabel = 'vo_logo_center';
      } else {
        const { x: lx, y: ly } = posExpr(logoPos);
        chains.push(logoOverlayChain(videoLabel, 'vo_logo_corner', lx, ly));
        videoLabel = 'vo_logo_corner';
      }
    }

    // ข้อความ
    if (centerMode) {
      const lines = [];
      if (titleText.trim())   lines.push({ text: titleText.trim(), size: titleSize, y: 'H*0.35' });
      if (subtitleText.trim())lines.push({ text: subtitleText.trim(), size: subtitleSize, y: 'H*0.50' });
      if (taglineText.trim()) lines.push({ text: taglineText.trim(), size: taglineSize, y: 'H*0.65' });

      for (let i=0;i<lines.length;i++) {
        const lblIn = (i===0 ? videoLabel : `vc${i}`);
        const lblOut = `vc${i+1}`;
        const txt = escDrawText(lines[i].text);
        const fontFile = pickFontForText(lines[i].text);
        const boxParams = textBackground ? ':box=1:boxcolor=black@0.25:boxborderw=16' : '';
        chains.push(
          `[${lblIn}]drawtext=fontfile='${fontFile}':text='${txt}':` +
          `fontsize=${lines[i].size}:fontcolor=white@0.98:` +
          `shadowcolor=black@0.6:shadowx=2:shadowy=2:` +
          `x=(w-text_w)/2:y=${lines[i].y}-text_h/2${boxParams}[${lblOut}]`
        );
        videoLabel = lblOut;
      }
    } else if (overlayText.trim()) {
      const { x: tx, y: ty } = posExpr(textPos);
      const txt = escDrawText(overlayText.trim());
      const fontFile = pickFontForText(overlayText.trim());
      const boxParams = textBackground ? ':box=1:boxcolor=black@0.25:boxborderw=12' : '';
      chains.push(
        `[${videoLabel}]drawtext=fontfile='${fontFile}':text='${txt}':` +
        `fontsize=${fontSize}:fontcolor=white@0.96:` +
        `shadowcolor=black@0.6:shadowx=2:shadowy=2:` +
        `x=${tx}:y=${ty}${boxParams}[vout]`
      );
      videoLabel = 'vout';
    }

    if (chains.length) {
      args.push('-filter_complex', chains.join(';'), '-map', `[${videoLabel}]`, '-map', '1:a:0');
    } else {
      args.push('-shortest', '-map','0:v:0','-map','1:a:0');
    }

    // 3) encode & ตัดตามความยาวเสียง
    args.push(
      '-shortest',
      '-c:v','libx264','-pix_fmt','yuv420p',
      '-c:a','aac','-b:a','192k',
      '-movflags','+faststart',
      outputPath
    );

    await runFFmpeg(args);
    return { ok: true };

  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});
