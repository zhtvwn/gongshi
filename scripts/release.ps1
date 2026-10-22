<#
.SYNOPSIS
    提交当前所有改动 → 推送 main → 自动递增标签并推送（触发 GitHub Actions 构建与 Release）

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Message "fix: 修复 xxx"
    powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Message "feat: 新功能" -Bump minor
#>
param(
    [string]$Message = "chore: 更新",
    [ValidateSet("patch", "minor", "major")]
    [string]$Bump = "patch"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# 1) 提交
git add -A
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "[release] 没有需要提交的改动，跳过提交" -ForegroundColor Yellow
} else {
    git commit -m $Message
    if ($LASTEXITCODE -ne 0) { throw "git commit 失败" }
}

# 2) 推送 main
git push origin main
if ($LASTEXITCODE -ne 0) { throw "git push main 失败" }

# 3) 计算新标签
git fetch --tags --quiet
$last = (git tag --list "v*" --sort=-v:refname | Select-Object -First 1)
if (-not $last) { $last = "v0.0.0" }
$parts = $last.TrimStart("v").Split(".") | ForEach-Object { [int]$_ }
while ($parts.Count -lt 3) { $parts += 0 }

switch ($Bump) {
    "major" { $parts = @($parts[0] + 1, 0, 0) }
    "minor" { $parts = @($parts[0], $parts[1] + 1, 0) }
    default { $parts = @($parts[0], $parts[1], $parts[2] + 1) }
}
$next = "v" + ($parts -join ".")

# 4) 打标签并推送
git tag -a $next -m "$next`: $Message"
git push origin $next
if ($LASTEXITCODE -ne 0) { throw "git push tag 失败" }

Write-Host "[release] 已发布 $next（$Message）" -ForegroundColor Green
Write-Host "[release] 构建进度: https://github.com/zhtvwn/gongshi/actions" -ForegroundColor Cyan
