@echo off
REM Quick-start helper script for generating manifest and catalog JSON from MySQL (Windows)
REM
REM USAGE:
REM   quick-start-mysql.bat
REM
REM REQUIREMENTS:
REM   - MySQL Command-line client installed and in PATH
REM   - MySQL 8.0+ server access
REM   - jq (optional, for JSON validation)

setlocal enabledelayedexpansion

REM Colors won't work in old cmd, so we'll use basic formatting
echo.
echo =====================================================================
echo    Supercharged dbt-docs: MySQL Quick-Start (Windows)
echo =====================================================================
echo.

REM =========================================================================
REM Step 1: Gather Configuration
REM =========================================================================

echo [Step 1] Configure Database Connection
echo.

set /p DB_HOST="MySQL Host [localhost]: "
if "%DB_HOST%"=="" set DB_HOST=localhost

set /p DB_PORT="MySQL Port [3306]: "
if "%DB_PORT%"=="" set DB_PORT=3306

set /p DB_NAME="MySQL Database Name [adventureworks]: "
if "%DB_NAME%"=="" set DB_NAME=adventureworks

set /p MYSQL_ROOT_USER="MySQL Root User [root]: "
if "%MYSQL_ROOT_USER%"=="" set MYSQL_ROOT_USER=root

set /p MYSQL_ROOT_PASSWORD="MySQL Root Password: "
if "%MYSQL_ROOT_PASSWORD%"=="" (
  echo ERROR: Password required
  exit /b 1
)

REM Test connection
echo.
echo Testing MySQL connection...
mysql -h %DB_HOST% -P %DB_PORT% -u %MYSQL_ROOT_USER% -p%MYSQL_ROOT_PASSWORD% -e "SELECT 1;" >nul 2>&1

if errorlevel 1 (
  echo ERROR: Connection failed. Check credentials and try again.
  exit /b 1
)

echo OK - Connection successful
echo.

REM =========================================================================
REM Step 2: Create Read-Only User (Optional)
REM =========================================================================

echo [Step 2] Create Read-Only Database User
echo.

set /p CREATE_USER="Create new read-only user 'dbt_analyzer'? [y/N]: "

if /i "%CREATE_USER%"=="y" (
  set /p DBA_PASSWORD="Enter password for 'dbt_analyzer': "
  
  (
    echo CREATE USER IF NOT EXISTS 'dbt_analyzer'^@'%%' IDENTIFIED BY '!DBA_PASSWORD!';
    echo GRANT SELECT ON INFORMATION_SCHEMA.* TO 'dbt_analyzer'^@'%%';
    echo GRANT SELECT ON `%DB_NAME%`.* TO 'dbt_analyzer'^@'%%';
    echo FLUSH PRIVILEGES;
  ) | mysql -h %DB_HOST% -P %DB_PORT% -u %MYSQL_ROOT_USER% -p%MYSQL_ROOT_PASSWORD%
  
  echo OK - User created: dbt_analyzer
  echo.
  
  set DB_USER=dbt_analyzer
  set DB_PASSWORD=!DBA_PASSWORD!
) else (
  set /p DB_USER="Existing MySQL User: "
  set /p DB_PASSWORD="Password for %DB_USER%: "
)

REM =========================================================================
REM Step 3: Generate Manifest JSON
REM =========================================================================

echo [Step 3] Generating manifest.json
echo.

set MANIFEST_OUTPUT=manifest.json

if not exist mysql_manifest_generator.sql (
  echo ERROR: mysql_manifest_generator.sql not found
  echo Make sure you're in the scripts/sql-generators directory
  exit /b 1
)

echo Executing MySQL query...
mysql -h %DB_HOST% -P %DB_PORT% -u %DB_USER% -p%DB_PASSWORD% %DB_NAME% < mysql_manifest_generator.sql > %MANIFEST_OUTPUT% 2>nul

if exist %MANIFEST_OUTPUT% (
  echo OK - Manifest generated: %MANIFEST_OUTPUT%
  
  REM Validate JSON with jq if available
  jq --version >nul 2>&1
  if errorlevel 0 (
    jq empty %MANIFEST_OUTPUT% >nul 2>&1
    if errorlevel 0 (
      echo OK - JSON validation passed
      for /f %%A in ('jq ".nodes | length" %MANIFEST_OUTPUT% 2^>nul') do set NODE_COUNT=%%A
      if not "!NODE_COUNT!"=="" echo    Extracted !NODE_COUNT! nodes
    ) else (
      echo WARNING - JSON validation failed - manual review needed
    )
  )
  echo.
) else (
  echo ERROR: Failed to generate manifest
  exit /b 1
)

REM =========================================================================
REM Step 4: Generate Catalog JSON
REM =========================================================================

echo [Step 4] Generating catalog.json
echo.

set CATALOG_OUTPUT=catalog.json

if not exist mysql_catalog_generator.sql (
  echo ERROR: mysql_catalog_generator.sql not found
  exit /b 1
)

echo Executing MySQL query...
mysql -h %DB_HOST% -P %DB_PORT% -u %DB_USER% -p%DB_PASSWORD% %DB_NAME% < mysql_catalog_generator.sql > %CATALOG_OUTPUT% 2>nul

if exist %CATALOG_OUTPUT% (
  echo OK - Catalog generated: %CATALOG_OUTPUT%
  
  jq --version >nul 2>&1
  if errorlevel 0 (
    jq empty %CATALOG_OUTPUT% >nul 2>&1
    if errorlevel 0 (
      echo OK - JSON validation passed
      for /f %%A in ('jq ".nodes | length" %CATALOG_OUTPUT% 2^>nul') do set NODE_COUNT=%%A
      if not "!NODE_COUNT!"=="" echo    Extracted !NODE_COUNT! nodes
    ) else (
      echo WARNING - JSON validation failed - manual review needed
    )
  )
  echo.
) else (
  echo ERROR: Failed to generate catalog
  exit /b 1
)

REM =========================================================================
REM Step 5: Copy to Application
REM =========================================================================

echo [Step 5] Install JSON Files
echo.

set /p COPY_FILES="Copy JSON files to ..\..\..\..\public? [y/N]: "

if /i "%COPY_FILES%"=="y" (
  REM Navigate to target directory
  if exist ..\..\..\public (
    copy %MANIFEST_OUTPUT% ..\..\..\public\
    copy %CATALOG_OUTPUT% ..\..\..\public\
    echo OK - Files copied to ..\..\..\public
    echo.
  ) else (
    echo WARNING - Directory ..\..\..\public not found
    echo Manual action: Copy %MANIFEST_OUTPUT% and %CATALOG_OUTPUT% to your public directory
    echo.
  )
)

REM =========================================================================
REM Summary
REM =========================================================================

echo =====================================================================
echo    SETUP COMPLETE!
echo =====================================================================
echo.

echo Next steps:
echo   1. Review the generated JSON files for accuracy
echo   2. Restart your application (or redeploy if using auto-discovery)
echo   3. Visit http://localhost:3000 to see the documentation
echo.
echo For full documentation, see: README.md
echo For security best practices, see: SECURITY_REVIEW.md
echo.

endlocal
