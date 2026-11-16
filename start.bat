@echo off
cd /d "%~dp0"
start "" http://localhost:8780
python devserver.py 8780
