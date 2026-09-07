# build.ps1 — 生成本地安装包 avdb-local.zip
# 用法：在 miniapps/avdb 目录下执行  .\build.ps1
#
# 说明：
#   manifest.json 的 entry 是 jsDelivr URL（用于「从链接安装」）
#   打本地包时临时将 entry 改为 index.html，打完后自动还原

$ErrorActionPreference = 'Stop'
$dir     = $PSScriptRoot
$scripts = "$dir\..\..\skills\miniapp-dev\scripts"
$env:PYTHONIOENCODING = 'utf-8'

Write-Host "`n[1/4] 备份 manifest.json..."
$orig = Get-Content "$dir\manifest.json" -Raw
Copy-Item "$dir\manifest.json" "$dir\manifest.json.bak" -Force

Write-Host "[2/4] 切换 entry 为本地相对路径..."
$patched = $orig -replace '"entry":\s*"https://[^"]*"', '"entry": "index.html"'
$patched | Set-Content "$dir\manifest.json" -Encoding UTF8

try {
    Write-Host "[3/4] 运行 pack_miniapp.py..."
    python3 "$scripts\pack_miniapp.py" $dir

    # pack 脚本在上级目录生成 avdb-vX.zip，找到并复制
    $zipSrc = Get-ChildItem "$dir\.." -Filter "avdb-v*.zip" |
              Sort-Object LastWriteTime -Descending | Select-Object -First 1

    if ($zipSrc) {
        $dest = "$dir\avdb-local.zip"
        Copy-Item $zipSrc.FullName $dest -Force
        Write-Host "`n✅ 本地安装包：$dest"
        Write-Host "   大小: $('{0:N1}' -f ($zipSrc.Length/1KB)) KB"
    } else {
        Write-Warning "未找到生成的 zip 文件，请检查 pack_miniapp.py 输出"
    }
} finally {
    Write-Host "[4/4] 还原 manifest.json..."
    Copy-Item "$dir\manifest.json.bak" "$dir\manifest.json" -Force
    Remove-Item "$dir\manifest.json.bak" -Force
    Write-Host "manifest.json 已还原`n"
}
