@echo off
cd /d D:\Projects\Atlas-job-os
npx tsx --env-file=.env --env-file=.env.local src/lib/services/browser/server.ts
pause
