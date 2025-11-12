const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

// Ensure userData directory exists on app start
app.on('ready', () => {
  try {
    const userDataPath = app.getPath('userData');
    console.log('[App] userData path:', userDataPath);

    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
      console.log('[App] ✅ Created userData directory');
    } else {
      console.log('[App] userData directory already exists');
    }

    // Verify permissions
    fs.accessSync(userDataPath, fs.constants.W_OK);
    console.log('[App] ✅ userData directory is writable');
  } catch (err) {
    console.error('[App] ❌ Failed to setup userData directory:', err.message);
    console.error('[App] This will cause license/trial issues!');
  }
});

const license = require('./license');

// Determine architecture and paths
const arch = os.arch(); // 'x64' or 'arm64'
const platform = os.platform(); // 'darwin', 'win32', 'linux'

// In packaged app, ffmpeg/ffprobe are in Resources folder
// In development, use the npm packages
let ffmpegPath, ffprobePath;

if (app.isPackaged) {
  const resourcesPath = process.resourcesPath;

  if (platform === 'win32') {
    // Windows: use win32-x64 binaries with .exe extension
    ffmpegPath = path.join(resourcesPath, 'ffmpeg', 'ffmpeg.exe');
    ffprobePath = path.join(resourcesPath, 'ffprobe', 'ffprobe.exe');
  } else if (platform === 'darwin') {
    // macOS: use darwin-x64 or darwin-arm64
    const ffmpegFolder = arch === 'arm64' ? 'ffmpeg-arm64' : 'ffmpeg';
    const ffprobeFolder = arch === 'arm64' ? 'ffprobe-arm64' : 'ffprobe';
    ffmpegPath = path.join(resourcesPath, ffmpegFolder, 'ffmpeg');
    ffprobePath = path.join(resourcesPath, ffprobeFolder, 'ffprobe');
  } else {
    // Linux or other
    ffmpegPath = path.join(resourcesPath, 'ffmpeg', 'ffmpeg');
    ffprobePath = path.join(resourcesPath, 'ffprobe', 'ffprobe');
  }
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
// Get duration of audio/video file using ffprobe
function getDuration(filePath) {
  return new Promise((resolve, reject) => {
    if (!ffprobePath) return reject(new Error('ไม่พบ ffprobe'));
    const proc = spawn(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ], { windowsHide: true });

    let output = '';
    proc.stdout.on('data', d => output += d.toString());
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        resolve(isNaN(duration) ? 0 : duration);
      } else {
        reject(new Error(`ffprobe exited ${code}`));
      }
    });
  });
}

// Convert time string (HH:MM:SS.MS) to seconds
function timeToSeconds(timeStr) {
  const parts = timeStr.split(':');
  if (parts.length !== 3) return 0;
  const hours = parseFloat(parts[0]) || 0;
  const minutes = parseFloat(parts[1]) || 0;
  const seconds = parseFloat(parts[2]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

function runFFmpeg(args, totalDuration = 0, statusMessage = '') {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('ไม่พบ ffmpeg-static'));
    const proc = spawn(ffmpegPath, args, { windowsHide: true });

    let lastProgressTime = Date.now();
    let heartbeatInterval = null;

    // Send heartbeat every 5 seconds to show process is still alive
    if (totalDuration > 0) {
      heartbeatInterval = setInterval(() => {
        const timeSinceLastProgress = Date.now() - lastProgressTime;
        if (timeSinceLastProgress > 5000) {
          // No progress update for 5+ seconds, send keepalive
          win?.webContents.send('ffmpeg-log', `[กำลังทำงาน... (${Math.floor(timeSinceLastProgress/1000)}s)]\n`);
        }
      }, 5000);
    }

    proc.stdout.on('data', d => {
      lastProgressTime = Date.now();
      win?.webContents.send('ffmpeg-log', d.toString());
    });

    proc.stderr.on('data', d => {
      const line = d.toString();
      lastProgressTime = Date.now();
      win?.webContents.send('ffmpeg-log', line);

      // Parse progress from FFmpeg output
      if (totalDuration > 0) {
        const timeMatch = line.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
        if (timeMatch) {
          const currentTime = timeToSeconds(timeMatch[1]);
          const percent = Math.min(100, Math.round((currentTime / totalDuration) * 100));
          win?.webContents.send('progress', {
            percent,
            currentTime,
            totalDuration,
            status: statusMessage
          });
        }
      }
    });

    proc.on('error', (err) => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      reject(err);
    });

    proc.on('close', code => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      code === 0 ? resolve() : reject(new Error(`FFmpeg exited ${code}`));
    });
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
function getVideoEncodingArgs(format, quality) {
  // For MOV with ProRes codec (high quality, large file size)
  if (format === 'mov') {
    const proresProfiles = {
      'medium': 'proxy',      // ProRes Proxy
      'high': '2',            // ProRes 422
      'very-high': '3',       // ProRes 422 HQ
      'ultra': '4'            // ProRes 4444
    };
    const profile = proresProfiles[quality] || '3';
    return ['-c:v', 'prores_ks', '-profile:v', profile, '-pix_fmt', 'yuv422p10le'];
  }

  // For MOV with H.264 (better quality than MP4 H.264)
  if (format === 'mov-h264') {
    const settings = {
      'medium': { crf: 20, bitrate: '8000k' },
      'high': { crf: 18, bitrate: '12000k' },
      'very-high': { crf: 16, bitrate: '18000k' },
      'ultra': { crf: 14, bitrate: '25000k' }
    };
    const { crf, bitrate } = settings[quality] || settings['very-high'];
    return ['-c:v', 'libx264', '-crf', String(crf), '-b:v', bitrate, '-pix_fmt', 'yuv420p', '-preset', 'slow'];
  }

  // For MP4 with H.264 (balanced quality and file size)
  const settings = {
    'medium': { crf: 23, bitrate: '5000k' },
    'high': { crf: 20, bitrate: '8000k' },
    'very-high': { crf: 18, bitrate: '12000k' },
    'ultra': { crf: 15, bitrate: '20000k' }
  };
  const { crf, bitrate } = settings[quality] || settings['very-high'];
  return ['-c:v', 'libx264', '-crf', String(crf), '-b:v', bitrate, '-pix_fmt', 'yuv420p', '-preset', 'medium'];
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
    properties: ['openFile', 'multiSelections']
  });
  return canceled ? [] : filePaths;
});
ipcMain.handle('pick-audios', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
    filters: [{ name: 'Audio', extensions: ['mp3','wav','m4a'] }], properties: ['openFile','multiSelections']
  });
  return canceled ? [] : filePaths;
});
ipcMain.handle('pick-output', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow(), {
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'mov'] },
      { name: 'MP4', extensions: ['mp4'] },
      { name: 'MOV', extensions: ['mov'] }
    ],
    defaultPath: 'output.mp4'
  });
  return canceled ? null : filePath;
});
ipcMain.handle('pick-logo', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
    filters: [{ name: 'Image', extensions: ['png','jpg','jpeg'] }], properties: ['openFile']
  });
  return canceled ? null : filePaths[0];
});

// ---------- License System ----------
// License IPC handlers
ipcMain.handle('check-license', async () => {
  return await license.checkLicense();
});

ipcMain.handle('activate-license', async (_e, licenseKey) => {
  const result = await license.validateLicenseKey(licenseKey);
  // Note: validateLicenseKey now automatically saves if valid
  return result;
});

// Open external links
ipcMain.handle('open-external', async (_e, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('merge-and-loop', async (_e, payload) => {
  try {
    const {
      videoFiles, audioFiles, outputPath,
      outputFormat = 'mp4',
      videoQuality = 'very-high',
      centerMode = false,
      textBackground = true,
      titleText = '', titleSize = 64,
      subtitleText = '', subtitleSize = 48,
      taglineText = '', taglineSize = 36,
      overlayText = '', textPos = 'br', fontSize = 48,
      logoPath = '', logoScale = 0.3, logoOpacity = 0.9, logoPos = 'br'
    } = payload || {};

    if (!videoFiles?.length || !audioFiles?.length || !outputPath) {
      throw new Error('กรุณาเลือกไฟล์ให้ครบ (วิดีโอ/รูปภาพ, เสียง, ผลลัพธ์)');
    }

    const tmp = app.getPath('temp');

    // 1) รวมวิดีโอถ้ามีหลายไฟล์
    let videoPath = videoFiles[0];

    // Check if all files are images
    const allImages = videoFiles.every(f => /\.(png|jpe?g)$/i.test(f));
    const hasMultipleFiles = videoFiles.length > 1;

    if (hasMultipleFiles && !allImages) {
      win?.webContents.send('progress', { percent: 0, status: 'กำลังต่อวิดีโอหลายไฟล์...' });

      // If there are mixed files (images + videos), convert images to video first
      const processedFiles = [];
      for (const file of videoFiles) {
        const isImage = /\.(png|jpe?g)$/i.test(file);
        if (isImage) {
          // Convert image to 5-second video
          const tempVideo = path.join(tmp, `img_${Date.now()}_${processedFiles.length}.mp4`);
          await runFFmpeg(
            ['-loop', '1', '-i', file, '-t', '5', '-pix_fmt', 'yuv420p', '-vf', 'fps=25', tempVideo],
            5,
            'กำลังแปลงรูปภาพเป็นวิดีโอ...'
          );
          processedFiles.push(tempVideo);
        } else {
          processedFiles.push(file);
        }
      }

      // Create concat list file
      const videoListPath = path.join(tmp, `video_list_${Date.now()}.txt`);
      const videoListContent = processedFiles.map(p => `file '${p.replace(/'/g, `'\\''`)}'`).join('\n');
      fs.writeFileSync(videoListPath, videoListContent, 'utf8');

      // Concatenate videos (re-encode to ensure compatibility)
      const concatenatedVideo = path.join(tmp, `concatenated_${Date.now()}.mp4`);
      await runFFmpeg(
        ['-f', 'concat', '-safe', '0', '-i', videoListPath, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', concatenatedVideo],
        0,
        'กำลังต่อวิดีโอหลายไฟล์...'
      );
      videoPath = concatenatedVideo;
    }

    const isImage = allImages;

    // 2) รวมเสียงถ้ามีหลายไฟล์
    let mergedAudio = audioFiles[0];
    let audioDuration = 0;

    if (audioFiles.length > 1) {
      win?.webContents.send('progress', { percent: 0, status: 'กำลังรวมไฟล์เสียง...' });

      // Calculate total duration of all audio files
      for (const audioFile of audioFiles) {
        const duration = await getDuration(audioFile);
        audioDuration += duration;
      }

      const listPath = path.join(tmp, `list_${Date.now()}.txt`);
      const content = audioFiles.map(p => `file '${p.replace(/'/g, `'\\''`)}'`).join('\n');
      fs.writeFileSync(listPath, content, 'utf8');
      mergedAudio = path.join(tmp, `merged_${Date.now()}.m4a`);
      await runFFmpeg(
        ['-f','concat','-safe','0','-i', listPath, '-c:a','aac','-b:a','192k', mergedAudio],
        audioDuration,
        'กำลังรวมไฟล์เสียง...'
      );
    } else {
      // Get duration of single audio file
      audioDuration = await getDuration(mergedAudio);
    }

    // 3) ฟิลเตอร์วิดีโอ
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

    // 4) encode & ตัดตามความยาวเสียง
    const encodingArgs = getVideoEncodingArgs(outputFormat, videoQuality);
    args.push('-shortest');
    args.push(...encodingArgs);
    args.push('-c:a', 'aac', '-b:a', '192k');

    // Add faststart for MP4/MOV for better streaming
    if (outputFormat === 'mp4' || outputFormat === 'mov-h264') {
      args.push('-movflags', '+faststart');
    }

    args.push(outputPath);

    // Warn user if video is very long (> 30 minutes)
    if (audioDuration > 1800) {
      const minutes = Math.round(audioDuration / 60);
      win?.webContents.send('ffmpeg-log', `\n⚠️ คำเตือน: วิดีโอยาว ${minutes} นาที อาจใช้เวลาประมวลผลนาน 10-30 นาที\n`);
      win?.webContents.send('ffmpeg-log', `กรุณาอย่าปิดโปรแกรม กำลังประมวลผล...\n\n`);
    }

    win?.webContents.send('progress', { percent: 0, status: 'กำลังสร้างวิดีโอ...' });
    await runFFmpeg(args, audioDuration, 'กำลังสร้างวิดีโอ...');

    // Send completion
    win?.webContents.send('progress', { percent: 100, status: 'เสร็จสิ้น!' });

    return { ok: true };

  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});
