#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * afterPack hook for electron-builder
 * Ensures ffmpeg/ffprobe binaries have executable permissions
 */
exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir } = context;

  console.log(`\n[afterPack] Platform: ${electronPlatformName}, OutDir: ${appOutDir}\n`);

  if (electronPlatformName === 'darwin') {
    // macOS: Resources folder is inside .app/Contents/
    const resourcesPath = path.join(appOutDir, 'Loop Video to Audio.app', 'Contents', 'Resources');

    // Find all ffmpeg/ffprobe binaries and chmod them
    const binaryPaths = [
      path.join(resourcesPath, 'ffmpeg', 'ffmpeg'),
      path.join(resourcesPath, 'ffmpeg-arm64', 'ffmpeg'),
      path.join(resourcesPath, 'ffprobe', 'ffprobe'),
      path.join(resourcesPath, 'ffprobe-arm64', 'ffprobe'),
    ];

    for (const binaryPath of binaryPaths) {
      if (fs.existsSync(binaryPath)) {
        console.log(`[afterPack] chmod +x ${binaryPath}`);
        execSync(`chmod +x "${binaryPath}"`);
      } else {
        console.log(`[afterPack] Binary not found: ${binaryPath}`);
      }
    }
  } else if (electronPlatformName === 'win32') {
    // Windows: Resources folder is in root of app
    const resourcesPath = path.join(appOutDir, 'resources');

    const binaryPaths = [
      path.join(resourcesPath, 'ffmpeg', 'ffmpeg.exe'),
      path.join(resourcesPath, 'ffprobe', 'ffprobe.exe'),
    ];

    for (const binaryPath of binaryPaths) {
      if (fs.existsSync(binaryPath)) {
        console.log(`[afterPack] Found: ${binaryPath}`);
      } else {
        console.log(`[afterPack] Binary not found: ${binaryPath}`);
      }
    }
  }

  console.log('[afterPack] Done!\n');
};
