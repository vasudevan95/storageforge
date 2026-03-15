@echo off
cd /d D:\Projects\Hackthon\storyforge\frontend

if not exist node_modules (
    echo Installing dependencies...
    npm install
)

echo.
echo Starting StoryForge Frontend on http://localhost:3000
echo.
npm run dev
pause
