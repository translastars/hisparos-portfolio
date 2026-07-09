@echo off
REM ========================================
REM Hisparos Jobs + News Scraper — Daily Runner
REM Scrapes LinkedIn for legal/sworn translation jobs
REM Runs news scraper from RSS feeds
REM Syncs to GitHub + Vercel deploy
REM ========================================
cd /d "C:\Users\barto\.openclaw\workspace\hisparos_portfolio"

echo [%date% %time%] Starting Hisparos LinkedIn scraper...
node _scrape_linkedin_hisparos.js >> data\scrape_log.txt 2>&1

echo [%date% %time%] Running news scraper...
node scrapers/news_scraper.js >> data\scrape_log.txt 2>&1

echo [%date% %time%] Syncing to GitHub...
powershell -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Continue';" ^
  "Push-Location 'C:\Users\barto\.openclaw\workspace\hisparos_portfolio';" ^
  "git add -A api/data/jobs.json api/data/news.json jobs.html data/scrape_log.txt 2>&1 | Out-Null;" ^
  "$d = Get-Date -Format 'yyyy-MM-dd HH:mm';" ^
  "git commit -m 'auto: daily jobs + news update [" + date + " " + time + "]' 2>&1 | Out-Null;" ^
  "try { git push 2>&1 } catch { echo 'Push failed' };" ^
  "Pop-Location"

if %ERRORLEVEL% NEQ 0 (
  echo [%date% %time%] WARNING: Git sync issue, continuing...
)

echo [%date% %time%] Deploying to Vercel...
call npx vercel --prod --force >> data\scrape_log.txt 2>&1

echo [%date% %time%] Done.
