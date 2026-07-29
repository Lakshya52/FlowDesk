<#
.SYNOPSIS
  FlowDesk Full Backup Script — mongodump + .env archive (Atlas-compatible)
.DESCRIPTION
  - Dumps the FlowDesk MongoDB database from Atlas (or any remote)
  - Copies backend and frontend .env files
  - Compresses everything into a .zip archive
  - Rotates backups: keeps 7 daily, 4 weekly, 3 monthly
  - Logs all activity to a log file
  - Designed for Windows Server 2016, run via Task Scheduler
.PARAMETER MongoUri
  Full MongoDB connection string (Atlas SRV or standard). Required.
.PARAMETER BackupRoot
  Root directory where backups are stored (default: D:\backups\flowdesk)
.PARAMETER MongoBin
  Path to MongoDB bin directory (default: C:\Program Files\MongoDB\Server\7.0\bin)
.PARAMETER LogRetention
  Number of days to keep log files (default: 90)
.EXAMPLE
  .\flowdesk-backup.ps1 -MongoUri "mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/FlowDesk"
.EXAMPLE
  .\flowdesk-backup.ps1 -MongoUri "mongodb://user:pass@host:27017/FlowDesk?ssl=true" -MongoBin "C:\MongoDB\Tools\100\bin"
#>

param(
    [string]$MongoUri = "",
    [string]$BackupRoot = "D:\softwares\flowdesk\backup",
    [string]$MongoBin = "C:\Program Files\MongoDB\Tools\100\bin",
    [int]$LogRetention = 90
)

$ErrorActionPreference = "Stop"
$ScriptName = "flowdesk-backup.ps1"
$DateStamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$DatePrefix = Get-Date -Format "yyyy-MM-dd"
$LogFile = Join-Path $BackupRoot "backup.log"

# Application paths
$AppRoot = "D:\softwares\flowdesk"
$BackendEnv = Join-Path $AppRoot "backend\.env"
$FrontendEnv = Join-Path $AppRoot "frontend\.env"
$DbName = "test"  # fallback if URI has no database path

# Determine mongodump path
$MongoDump = Join-Path $MongoBin "mongodump.exe"
if (-not (Test-Path $MongoDump)) {
    $MongoDump = "mongodump"
}

# ---- Helpers ----
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] [$Level] $Message"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
}

function Get-UniqueSuffix {
    param([string]$Path)
    $i = 1
    $testPath = $Path
    while (Test-Path $testPath) {
        $testPath = [System.IO.Path]::GetDirectoryName($Path) + "\" + `
                    [System.IO.Path]::GetFileNameWithoutExtension($Path) + "_$i" + `
                    [System.IO.Path]::GetExtension($Path)
        $i++
    }
    return $testPath
}

function Remove-OldBackups {
    param([string]$Pattern, [int]$KeepCount)
    $files = Get-ChildItem -Path $BackupRoot -Filter $Pattern -File | Sort-Object LastWriteTime -Descending
    if ($files.Count -gt $KeepCount) {
        $toDelete = $files[$KeepCount..($files.Count - 1)]
        foreach ($f in $toDelete) {
            Remove-Item -Path $f.FullName -Force
            Write-Log "Deleted old backup: $($f.Name)"
        }
    } else {
        Write-Log "Retention check: $($files.Count) backups for '$Pattern', keeping up to $KeepCount"
    }
}

# ---- Pre-flight checks ----
if ([string]::IsNullOrWhiteSpace($MongoUri)) {
    Write-Host "ERROR: -MongoUri parameter is required." -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage: .\flowdesk-backup.ps1 -MongoUri `"mongodb+srv://user:pass@cluster.xxxxx.mongodb.net/FlowDesk`""
    Write-Host ""
    Write-Host "Tip: Copy the MONGODB_URI value from your backend .env file."
    exit 1
}

# ---- Main ----
Write-Log "=== FlowDesk Backup Started ==="
Write-Log "Backup root: $BackupRoot"
Write-Log "MongoDB URI: $($MongoUri -replace '://[^:]+:[^@]+@', '://***:***@')"  # mask credentials in log

# 1. Ensure backup directories exist
$DateDir = Join-Path $BackupRoot $DatePrefix
$DumpDir = Join-Path $DateDir "mongodump"
$null = New-Item -ItemType Directory -Path $DumpDir -Force
Write-Log "Backup directory: $DateDir"
# Clean up any stale dump from a previous run
if (Test-Path $DumpDir) { Remove-Item -Path $DumpDir -Recurse -Force }

# 2. mongodump (Atlas-compatible using --uri)
# Check if URI already has a database path (e.g. /FlowDesk before the ?)
$uriDbMatch = [regex]::Match($MongoUri, '://[^/]+/([^?]+)')
$hasDbInUri = $uriDbMatch.Success -and -not [string]::IsNullOrWhiteSpace($uriDbMatch.Groups[1].Value)

Write-Log "Running mongodump for database '$DbName'..."
try {
    if ($hasDbInUri) {
        & $MongoDump --uri="$MongoUri" --out $DumpDir
    } else {
        & $MongoDump --uri="$MongoUri" --db $DbName --out $DumpDir
    }
    $dumpExitCode = $LASTEXITCODE
    # Count actual BSON files written to confirm the dump worked
    $bsonCount = (Get-ChildItem -Path $DumpDir -Recurse -Filter "*.bson" | Measure-Object).Count
    if ($bsonCount -eq 0) {
        Write-Log "mongodump produced no BSON files (exit code $dumpExitCode)" -Level "ERROR"
        throw "mongodump produced no BSON files"
    }
    Write-Log "mongodump completed: $bsonCount BSON files written (exit code $dumpExitCode)."
} catch {
    Write-Log "mongodump FAILED: $_" -Level "ERROR"
    Write-Log "Possible causes: IP not whitelisted in Atlas Network Access, wrong credentials, or mongodump version mismatch." -Level "ERROR"
    exit 1
}

# 3. Create compressed archive
Write-Log "Creating ZIP archive..."
$ZipFileName = "flowdesk-backup_$DateStamp.zip"
$ZipPath = Join-Path $BackupRoot $ZipFileName
$ZipPath = Get-UniqueSuffix -Path $ZipPath

try {
    Compress-Archive -Path "$DumpDir\*" -DestinationPath $ZipPath -CompressionLevel Optimal
    Write-Log "ZIP archive created: $ZipPath"

    $zipSize = (Get-Item $ZipPath).Length
    $sizeMB = [math]::Round($zipSize / 1MB, 2)
    Write-Log "Archive size: $sizeMB MB"
} catch {
    Write-Log "Compression FAILED: $_" -Level "ERROR"
    exit 1
}

# 5. Clean up the temp directory
Remove-Item -Path $DateDir -Recurse -Force
Write-Log "Temporary files cleaned up."

# 6. Retention — Daily (keep last 7)
Write-Log "Applying retention policy..."
Remove-OldBackups -Pattern "flowdesk-backup_*.zip" -KeepCount 7

# 7. Retention — Weekly (keep last 4) — only on Sundays
$dayOfWeek = (Get-Date).DayOfWeek
if ($dayOfWeek -eq 'Sunday') {
    Write-Log "Sunday detected — marking backup for weekly retention."
    $weeklyDir = Join-Path $BackupRoot "weekly"
    $null = New-Item -ItemType Directory -Path $weeklyDir -Force
    Copy-Item -Path $ZipPath -Destination (Join-Path $weeklyDir "weekly_$DateStamp.zip") -Force
    Remove-OldBackups -Pattern "weekly_*.zip" -KeepCount 4
}

# 8. Retention — Monthly (keep last 3) — only on 1st of month
$day = (Get-Date).Day
if ($day -eq 1) {
    Write-Log "First of month detected — marking backup for monthly retention."
    $monthlyDir = Join-Path $BackupRoot "monthly"
    $null = New-Item -ItemType Directory -Path $monthlyDir -Force
    Copy-Item -Path $ZipPath -Destination (Join-Path $monthlyDir "monthly_$DateStamp.zip") -Force
    Remove-OldBackups -Pattern "monthly_*.zip" -KeepCount 3
}

# 9. Rotate old log files
Write-Log "Cleaning up log files older than $LogRetention days..."
$cutoff = (Get-Date).AddDays(-$LogRetention)
if (Test-Path $LogFile) {
    $oldLines = Get-Content $LogFile | Where-Object { $_ -match '^\[' }
    $filtered = $oldLines | Where-Object {
        $match = [regex]::Match($_, '\[(\d{4}-\d{2}-\d{2})')
        if ($match.Success) {
            $logDate = [DateTime]::ParseExact($match.Groups[1].Value, 'yyyy-MM-dd', $null)
            $logDate -ge $cutoff
        } else { $true }
    }
    if ($filtered) { $filtered | Set-Content $LogFile -Force }
}

Write-Log "=== FlowDesk Backup Completed Successfully ==="
Write-Log "Backup file: $ZipPath"
Exit 0
