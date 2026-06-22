const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Force dedicated GPU and ignore GPU blocklists
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

let useGPU = true;
try {
  const userDataPath = app.getPath('userData');
  const settingsFile = path.join(userDataPath, 'settings.json');
  if (fs.existsSync(settingsFile)) {
    const data = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    if (data.hasOwnProperty('gpuAcceleration')) {
      useGPU = !!data.gpuAcceleration;
    }
  }
} catch (e) {
  console.error("Failed to read settings.json at startup:", e);
}

if (!useGPU) {
  console.log("[Main] GPU hardware acceleration disabled by settings.");
  app.disableHardwareAcceleration();
} else {
  console.log("[Main] GPU hardware acceleration enabled by settings.");
}

function getFFmpegPath() {
  const userProfile = process.env.USERPROFILE || 'C:\\Users\\morar';
  
  const ffmpegPaths = [
    // 1. Local bin folder (project-specific)
    path.join(__dirname, '..', 'bin', 'ffmpeg.exe'),
    path.join(__dirname, '..', 'bin', 'ffmpeg'),

    // 2. Pinokio environments (highly recommended fallbacks on Windows)
    'E:\\pinokio_home\\bin\\miniconda\\Library\\bin\\ffmpeg.exe',
    'E:\\pinokio_home\\bin\\ffmpeg-env\\Library\\bin\\ffmpeg.exe',
    path.join(userProfile, 'pinokio', 'bin', 'miniconda', 'Library', 'bin', 'ffmpeg.exe'),
    path.join(userProfile, 'pinokio', 'bin', 'ffmpeg-env', 'Library', 'bin', 'ffmpeg.exe'),
    'C:\\pinokio_home\\bin\\miniconda\\Library\\bin\\ffmpeg.exe',
    'C:\\pinokio_home\\bin\\ffmpeg-env\\Library\\bin\\ffmpeg.exe',

    // 3. Anaconda / Miniconda default locations
    path.join(userProfile, 'miniconda3', 'Library', 'bin', 'ffmpeg.exe'),
    path.join(userProfile, 'anaconda3', 'Library', 'bin', 'ffmpeg.exe'),
    'C:\\miniconda3\\Library\\bin\\ffmpeg.exe',
    'E:\\miniconda3\\Library\\bin\\ffmpeg.exe',
  ];

  const localAppData = process.env.LOCALAPPDATA || path.join(userProfile, 'AppData', 'Local');
  const wingetFolder = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(wingetFolder)) {
    try {
      const pkgs = fs.readdirSync(wingetFolder);
      for (const pkg of pkgs) {
        if (pkg.toLowerCase().includes('ffmpeg')) {
          const pkgPath = path.join(wingetFolder, pkg);
          const scanDirs = [pkgPath, path.join(pkgPath, 'bin')];
          try {
            const subdirs = fs.readdirSync(pkgPath);
            for (const sub of subdirs) {
              scanDirs.push(path.join(pkgPath, sub, 'bin'));
              scanDirs.push(path.join(pkgPath, sub));
            }
          } catch (e) {}
          
          for (const dir of scanDirs) {
            const exe = path.join(dir, 'ffmpeg.exe');
            if (fs.existsSync(exe)) {
              ffmpegPaths.push(exe);
            }
          }
        }
      }
    } catch (err) {
      console.error("Error scanning WinGet FFmpeg:", err);
    }
  }

  // Fall back to system command
  ffmpegPaths.push('ffmpeg');

  for (const p of ffmpegPaths) {
    if (p === 'ffmpeg' || fs.existsSync(p)) {
      console.log("[Main] Resolved FFmpeg path:", p);
      return p;
    }
  }
  return 'ffmpeg';
}

let mainWindow;
const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] [Level ${level}] ${message} (${sourceId}:${line})`);
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const html = await mainWindow.webContents.executeJavaScript("document.getElementById('root').innerHTML");
        console.log(`[DOM Check] root innerHTML: ${html}`);
      } catch (err) {
        console.error(`[DOM Check] Error executing JS:`, err);
      }
    }, 5000);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ─── IPC Handlers ───────────────────────────────────────────

// Window controls
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

// GPU Settings
ipcMain.handle('set-gpu-acceleration', async (event, enabled) => {
  try {
    const userDataPath = app.getPath('userData');
    const settingsFile = path.join(userDataPath, 'settings.json');
    let settings = {};
    if (fs.existsSync(settingsFile)) {
      settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    }
    settings.gpuAcceleration = enabled;
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-gpu-acceleration', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const settingsFile = path.join(userDataPath, 'settings.json');
    if (fs.existsSync(settingsFile)) {
      const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      if (settings.hasOwnProperty('gpuAcceleration')) {
        return !!settings.gpuAcceleration;
      }
    }
  } catch (err) {}
  return true;
});

// File dialog
ipcMain.handle('open-file-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: options?.filters || [
      { name: 'Media Files', extensions: ['mp4', 'webm', 'avi', 'mov', 'mkv', 'mp3', 'wav', 'ogg', 'png', 'jpg', 'jpeg', 'gif', 'webp'] },
    ],
  });
  return result.filePaths;
});

// Save dialog
ipcMain.handle('save-file-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: options?.filters || [
      { name: 'MP4 Video', extensions: ['mp4'] },
    ],
    defaultPath: options?.defaultPath || 'output.mp4',
  });
  return result.filePath;
});

// Read file as buffer (for media)
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
      '.mp4': 'video/mp4', '.webm': 'video/webm', '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
      '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.webp': 'image/webp',
    };
    return {
      data: data.toString('base64'),
      mime: mimeMap[ext] || 'application/octet-stream',
      name: path.basename(filePath),
      path: filePath,
      ext,
    };
  } catch (err) {
    return { error: err.message };
  }
});

// Get file info
ipcMain.handle('get-file-info', async (event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return {
      name: path.basename(filePath),
      path: filePath,
      size: stats.size,
      ext: path.extname(filePath).toLowerCase(),
    };
  } catch (err) {
    return { error: err.message };
  }
});

let exportProcess = null;
let exportStderr = '';
let exportResolve = null;

// FFmpeg export (Native FFmpeg Command)
ipcMain.handle('export-video', async (event, { args, outputPath, totalDuration }) => {
  return new Promise((resolve) => {
    const ffmpegPath = getFFmpegPath();

    console.log('[Main] Spawn FFmpeg (Native Export):', ffmpegPath, args.join(' '));
    exportProcess = spawn(ffmpegPath, args);
    let stderr = '';

    exportProcess.stderr.on('data', (data) => {
      const log = data.toString();
      stderr += log;

      let percent = null;
      if (totalDuration && totalDuration > 0) {
        const timeMatch = log.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
        if (timeMatch) {
          const hours = parseInt(timeMatch[1], 10);
          const minutes = parseInt(timeMatch[2], 10);
          const seconds = parseInt(timeMatch[3], 10);
          const ms = parseInt(timeMatch[4], 10);
          const currentTime = hours * 3600 + minutes * 60 + seconds + ms / 100;
          percent = Math.min(99, Math.round((currentTime / totalDuration) * 100));
        }
      }

      mainWindow?.webContents.send('export-progress', {
        percent,
        log
      });
    });

    exportProcess.on('close', (code) => {
      exportProcess = null;
      if (code === 0) {
        mainWindow?.webContents.send('export-progress', { percent: 100 });
        resolve({ success: true, outputPath });
      } else {
        resolve({ success: false, error: stderr });
      }
    });

    exportProcess.on('error', (err) => {
      exportProcess = null;
      resolve({ success: false, error: err.message });
    });
  });
});

// Optimize video for frame-by-frame seeking (transcode with GOP=1)
ipcMain.handle('optimize-video', async (event, { filePath, duration }) => {
  return new Promise((resolve) => {
    try {
      const dir = path.dirname(filePath);
      const ext = path.extname(filePath);
      const base = path.basename(filePath, ext);
      const outputPath = path.join(dir, `${base}_optimized.mp4`);

      const ffmpegPath = getFFmpegPath();
      const args = [
        '-y',
        '-i', filePath,
        '-c:v', 'libx264',
        '-g', '1',
        '-preset', 'superfast',
        '-crf', '18',
        '-c:a', 'aac',
        outputPath
      ];

      console.log('[Main] Optimizing video:', ffmpegPath, args.join(' '));
      const proc = spawn(ffmpegPath, args);
      let stderr = '';

      proc.stderr.on('data', (data) => {
        const log = data.toString();
        stderr += log;

        if (duration && duration > 0) {
          const timeMatch = log.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
          if (timeMatch) {
            const hours = parseInt(timeMatch[1], 10);
            const minutes = parseInt(timeMatch[2], 10);
            const seconds = parseInt(timeMatch[3], 10);
            const ms = parseInt(timeMatch[4], 10);
            const currentTime = hours * 3600 + minutes * 60 + seconds + ms / 100;
            const percent = Math.min(99, Math.round((currentTime / duration) * 100));
            mainWindow?.webContents.send('optimize-progress', { percent, filePath });
          }
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          mainWindow?.webContents.send('optimize-progress', { percent: 100, filePath });
          resolve({ success: true, outputPath });
        } else {
          resolve({ success: false, error: stderr });
        }
      });

      proc.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
});

ipcMain.handle('start-frame-export', async (event, { settings, audioPath, backgroundVideoPath, totalDuration, outputPath }) => {
  return new Promise((resolve) => {
    const ffmpegPath = getFFmpegPath();

    const width = settings.width || 1080;
    const height = settings.height || 1920;
    const fps = settings.fps || 60;
    const codec = settings.codec || 'libx264';
    const crf = settings.crf || 18;

    const isGPU = codec && codec !== 'libx264';
    const args = [
      '-y',
    ];

    if (isGPU) {
      args.push('-hwaccel', 'auto');
    }

    // Input 0: Background video (if provided, loop it infinitely)
    if (backgroundVideoPath) {
      args.push('-stream_loop', '-1', '-i', backgroundVideoPath);
    }

    // Input 1 (or 0 if no bg video): Raw transparent video stream from stdin
    args.push(
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${width}x${height}`,
      '-r', String(fps),
      '-i', '-'
    );

    // Input 2 (or 1 if no bg video): Audio path
    if (audioPath) {
      args.push('-i', audioPath);
    }

    // Overlay transparent canvas on top of scaled/cropped background video
    if (backgroundVideoPath) {
      args.push(
        '-filter_complex',
        `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},setsar=1[bg];` +
        `[bg][1:v]overlay=format=auto[out]`,
        '-map', '[out]'
      );
    } else {
      args.push('-map', '0:v');
    }

    // Audio mapping
    if (audioPath) {
      const audioIndex = backgroundVideoPath ? 2 : 1;
      args.push('-map', `${audioIndex}:a`);
    }

    args.push(
      '-c:v', codec,
      '-pix_fmt', 'yuv420p',
      '-r', String(fps)
    );

    if (codec === 'libx264') {
      args.push('-preset', 'medium', '-crf', String(crf));
    } else if (codec === 'h264_nvenc') {
      args.push('-preset', 'p4', '-rc', 'vbr', '-cq', String(crf));
    } else if (codec === 'h264_amf') {
      args.push('-rc', 'cqp', '-qp_i', String(crf), '-qp_p', String(crf));
    } else if (codec === 'h264_qsv') {
      args.push('-global_quality', String(crf));
    }

    if (audioPath) {
      args.push('-c:a', 'aac', '-b:a', '192k');
    }

    if (totalDuration) {
      args.push('-t', String(totalDuration));
    }

    args.push('-shortest');
    args.push(outputPath);

    console.log('[Main] Spawn FFmpeg (Frame Stream):', ffmpegPath, args.join(' '));
    exportProcess = spawn(ffmpegPath, args);
    exportStderr = '';
    exportResolve = resolve;

    exportProcess.stderr.on('data', (data) => {
      exportStderr += data.toString();
      
      // Parse progress and send percent update if possible
      let percent = null;
      if (totalDuration && totalDuration > 0) {
        const log = data.toString();
        const timeMatch = log.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
        if (timeMatch) {
          const hours = parseInt(timeMatch[1], 10);
          const minutes = parseInt(timeMatch[2], 10);
          const seconds = parseInt(timeMatch[3], 10);
          const ms = parseInt(timeMatch[4], 10);
          const currentTime = hours * 3600 + minutes * 60 + seconds + ms / 100;
          percent = Math.min(99, Math.round((currentTime / totalDuration) * 100));
        }
      }
      
      mainWindow?.webContents.send('export-progress', { percent, log: data.toString() });
    });

    exportProcess.on('close', (code) => {
      if (code === 0) {
        mainWindow?.webContents.send('export-progress', { percent: 100 });
        exportResolve({ success: true, outputPath });
      } else {
        exportResolve({ success: false, error: exportStderr });
      }
      exportProcess = null;
    });

    exportProcess.on('error', (err) => {
      exportResolve({ success: false, error: err.message });
      exportProcess = null;
    });
  });
});

ipcMain.handle('send-frame', async (event, buffer) => {
  return new Promise((resolve) => {
    if (exportProcess && exportProcess.stdin && exportProcess.stdin.writable) {
      exportProcess.stdin.write(Buffer.from(buffer), (err) => {
        resolve(!err);
      });
    } else {
      resolve(false);
    }
  });
});

ipcMain.handle('end-frame-export', async () => {
  return new Promise((resolve) => {
    if (exportProcess && exportProcess.stdin) {
      exportProcess.stdin.end(() => {
        resolve(true);
      });
    } else {
      resolve(false);
    }
  });
});

ipcMain.handle('kill-export', async () => {
  return new Promise((resolve) => {
    if (exportProcess) {
      try {
        console.log('[Main] Killing FFmpeg export process...');
        exportProcess.kill('SIGKILL');
        exportProcess = null;
        resolve({ success: true });
      } catch (err) {
        resolve({ success: false, error: err.message });
      }
    } else {
      resolve({ success: false, error: 'No active export process' });
    }
  });
});
