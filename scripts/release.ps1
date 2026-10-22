<#
.SYNOPSIS
    同步版本号 -> 提交所有改动 -> 推送 main -> 自动递增标签并推送（触发 GitHub Actions 构建与 Release）

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Message "fix: 修复 xxx"
    powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Message "feat: 新功能" -Bump minor

.NOTE
    本文件必须以 UTF-8 with BOM 保存，否则 Windows PowerShell 5.1 解析中文会报错。
#>
param(
    [string]$Message = "chore: 更新",
    [ValidateSet("patch", "minor", "major")]
    [string]$Bump = "patch"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# 1) 计算下一个版本号（只取 major.minor.patch 三段）
git fetch --tags --quiet
$last = (git tag --list "v*" --sort=-v:refname | Select-Object -First 1)
if ([string]::IsNullOrWhiteSpace($last)) { $last = "v0.0.0" }
$nums = ($last -replace '^v', '') -split '\.'
$major = if ($nums.Count -ge 1) { [int]$nums[0] } else { 0 }
$minor = if ($nums.Count -ge 2) { [int]$nums[1] } else { 0 }
$patch = if ($nums.Count -ge 3) { [int]$nums[2] } else { 0 }

switch ($Bump) {
    "major" { $major++; $minor = 0; $patch = 0 }
    "minor" { $minor++; $patch = 0 }
    default { $patch++ }
}
$next = "v{0}.{1}.{2}" -f $major, $minor, $patch
$nextVer = "{0}.{1}.{2}" -f $major, $minor, $patch
Write-Host "[release] 下一个版本: $next" -ForegroundColor Cyan

# 2) 同步 package.json 版本号（保证安装包文件名与 tag 一致）
foreach ($rel in @('package.json', 'client/package.json')) {
    $path = Join-Path $repoRoot $rel
    if (-not (Test-Path -LiteralPath $path)) { continue }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    $m = [regex]::Match($text, '"version"\s*:\s*"[^"]*"')
    if ($m.Success) {
        $text = $text.Remove($m.Index, $m.Length).Insert($m.Index, '"version": "' + $nextVer + '"')
        [System.IO.File]::WriteAllText($path, $text, $utf8)
        Write-Host "[release] 已同步 $rel 版本号 -> $nextVer" -ForegroundColor Cyan
    }
}

# 3) 提交
git add -A
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "[release] 没有需要提交的改动，跳过提交" -ForegroundColor Yellow
} else {
    git commit -m $Message
    if ($LASTEXITCODE -ne 0) { throw "git commit 失败" }
}

# 4) 推送 main
git push origin main
if ($LASTEXITCODE -ne 0) { throw "git push main 失败" }

# 5) 打标签并推送
git tag -a $next -m ("{0}: {1}" -f $next, $Message)
if ($LASTEXITCODE -ne 0) { throw "git tag 失败" }
git push origin $next
if ($LASTEXITCODE -ne 0) { throw "git push tag 失败" }

Write-Host "[release] 已发布 $next（$Message）" -ForegroundColor Green
Write-Host "[release] 构建进度: https://github.com/zhtvwn/gongshi/actions" -ForegroundColor Cyan
