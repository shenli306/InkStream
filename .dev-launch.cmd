@echo off
start "inkstream-dev" /min "C:\Program Files\nodejs\node.exe" node_modules\next\dist\bin\next dev -p 3100 ^> .dev-server-run.log 2^>^&1
