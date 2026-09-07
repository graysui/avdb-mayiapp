# build.ps1 — 生成本地安装包 avdb-local.zip
# 用法：在 miniapps/avdb 目录下执行  .\build.ps1

$ErrorActionPreference = 'Stop'
$dir     = $PSScriptRoot
$scripts = "$dir\..\..\skills\miniapp-dev\scripts"
$env:PYTHONIOENCODING = 'utf-8'

Write-Host "`n[1/4] 备份 manifest.json..."
Copy-Item "$dir\manifest.json" "$dir\manifest.json.bak" -Force

Write-Host "[2/4] 用 Python 将 entry 切换为本地路径..."
python3 -c @"
import json
with open(r'$dir\manifest.json', encoding='utf-8') as f:
    m = json.load(f)
m['entry'] = 'index.html'
with open(r'$dir\manifest.json', 'w', encoding='utf-8') as f:
    json.dump(m, f, ensure_ascii=False, indent=2)
print('entry ->', m['entry'])
"@

try {
    Write-Host "[3/4] 运行 pack_miniapp.py..."
    python3 "$scripts\pack_miniapp.py" $dir

    # pack 脚本在上级目录生成 avdb-vX.zip，找最新的
    $zipSrc = Get-ChildItem "$dir\.." -Filter "avdb-v*.zip" |
              Sort-Object LastWriteTime -Descending | Select-Object -First 1

    if ($zipSrc) {
        $dest = "$dir\avdb-local.zip"
        Copy-Item $zipSrc.FullName $dest -Force
        $kb = [math]::Round($zipSrc.Length / 1KB, 1)
        Write-Host "`n✅ 本地安装包：$dest ($kb KB)"
    } else {
        Write-Warning "未找到生成的 zip，请检查 pack_miniapp.py 输出"
    }
} finally {
    Write-Host "[4/4] 还原 manifest.json..."
    Copy-Item "$dir\manifest.json.bak" "$dir\manifest.json" -Force
    Remove-Item "$dir\manifest.json.bak" -Force
    Write-Host "manifest.json 已还原`n"
}
