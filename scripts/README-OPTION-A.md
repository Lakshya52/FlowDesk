# FlowDesk — Option A: Windows Server 2016 Full Backup (Atlas)

## Prerequisites

1. **MongoDB Database Tools** (mongodump) — [Download here](https://www.mongodb.com/try/download/database-tools)
   - Install the **MSI** for Windows x86_64
   - Default: `C:\Program Files\MongoDB\Tools\100\bin\mongodump.exe`

2. **Atlas Network Access** — Your server's IP must be whitelisted
   - Atlas UI → **Network Access** → **Add IP Address**

3. **PowerShell 5.1** — Built into Windows Server 2016

---

## Setup Steps

### 1. Copy scripts to the server

Copy all files in this folder to `D:\softwares\flowdesk\scripts\`.

### 2. Create the backup directory

```powershell
New-Item -ItemType Directory -Path "D:\softwares\flowdesk\backup" -Force
```

### 3. Test the script manually

Open **PowerShell as Administrator**:

```powershell
cd D:\softwares\flowdesk\scripts
.\flowdesk-backup.ps1 -MongoUri "mongodb://AceoneSupport:A!ceone-mongocluster@ac-c2bzbo0-shard-00-00.dffbzkm.mongodb.net:27017,ac-c2bzbo0-shard-00-01.dffbzkm.mongodb.net:27017,ac-c2bzbo0-shard-00-02.dffbzkm.mongodb.net:27017/test?ssl=true&replicaSet=atlas-10c7ui-shard-0&authSource=admin&appName=Cluster0"
```

### 4. Update the Task XML with your Atlas URI

Edit `flowdesk-backup-task.xml` and replace the `-MongoUri` value with your actual Atlas connection string (make sure the database name in the URI matches your Atlas DB).

### 5. Import the scheduled task

```powershell
cd D:\softwares\flowdesk\scripts
schtasks /Create /XML "flowdesk-backup-task.xml" /TN "FlowDesk\DailyBackup"
```

### 6. Test the task

```powershell
schtasks /Run /TN "FlowDesk\DailyBackup"
```

---

## What the script does

| Step | Detail |
|------|--------|
| mongodump | Dumps the `FlowDesk` (or `test`) database from Atlas |
| Compress | Zips to `D:\softwares\flowdesk\backup\flowdesk-backup_<date>.zip` |
| Retention | Keeps last 7 daily, 4 weekly (Sundays), 3 monthly (1st) |
| Logging | Logs to `D:\softwares\flowdesk\backup\backup.log` |

---

## Restore Procedure

```powershell
# 1. Extract
Expand-Archive -Path "D:\softwares\flowdesk\backup\flowdesk-backup_<date>.zip" -DestinationPath "D:\temp\restore"

# 2. Restore to Atlas
& "C:\Program Files\MongoDB\Tools\100\bin\mongorestore.exe" --uri="<atlas-uri>" --dir "D:\temp\restore\mongodump\test"

# 3. Restart the app
pm2 restart all
```

---

## Current Settings

| Parameter | Value |
|---|---|
| `-MongoBin` | `C:\Program Files\MongoDB\Tools\100\bin` |
| `-BackupRoot` | `D:\softwares\flowdesk\backup` |
| `$AppRoot` | `D:\softwares\flowdesk` |
| `.env paths` | `backend\.env`, `frontend\.env` (not included in zip) |
| Retention | 7 daily / 4 weekly / 3 monthly | 