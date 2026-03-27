#!/usr/bin/env node
const fs   = require('fs');
const path = require('path');

console.log('\n🛡️  VisionTrace Setup\n');

// 1. Create backend .env.local
const backendEnv = path.join(__dirname, '..', 'backend', '.env');
if (!fs.existsSync(backendEnv)) {
  fs.copyFileSync(path.join(__dirname, '..', 'backend', '.env.example'), backendEnv);
  console.log('✓ Created backend/.env  — add your GEMINI_API_KEY');
} else {
  console.log('· backend/.env already exists');
}

// 2. Create frontend .env.local
const frontendEnv = path.join(__dirname, '..', 'frontend', '.env.local');
if (!fs.existsSync(frontendEnv)) {
  fs.copyFileSync(path.join(__dirname, '..', 'frontend', '.env.local.example'), frontendEnv);
  console.log('✓ Created frontend/.env.local');
} else {
  console.log('· frontend/.env.local already exists');
}

// 3. Create surveillance-videos directory with sample structure
const videosDir = path.join(__dirname, '..', 'surveillance-videos');
const today     = new Date().toISOString().split('T')[0];
const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

[today, yesterday].forEach(date => {
  const dir = path.join(videosDir, date);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✓ Created surveillance-videos/${date}/`);
  }
});

// 4. Create .gitignore for videos dir
const gitignore = path.join(videosDir, '.gitignore');
if (!fs.existsSync(gitignore)) {
  fs.writeFileSync(gitignore, '*.mp4\n*.mkv\n*.avi\n*.mov\n*.webm\n');
}

console.log(`
─────────────────────────────────────────────
 NEXT STEPS:
 1. Edit backend/.env — set GEMINI_API_KEY
 2. npm run install:all
 3. npm run dev
 4. Open http://localhost:3000
─────────────────────────────────────────────
 VIDEO FOLDER STRUCTURE:
   surveillance-videos/
     YYYY-MM-DD/
       HH-MM-SS.mp4   ← e.g. 14-30-00.mp4
─────────────────────────────────────────────
`);
