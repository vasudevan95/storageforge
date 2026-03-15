@echo off
cd /d D:\Projects\Hackthon\storyforge\backend

if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)

call venv\Scripts\activate

echo Upgrading pip...
python -m pip install --upgrade pip

echo Installing dependencies...
pip install -r requirements.txt

echo.
echo Starting StoryForge Backend on http://localhost:8080
echo.
uvicorn main:app --reload --port 8080
pause
