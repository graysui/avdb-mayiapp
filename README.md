# AVDB × 蚂蚁App 小程序

连接 [AVDB](https://github.com/graysui/avdb) 后端的蚂蚁App小程序：
- 浏览 JavDB 在线资源（最新 / 排行 / 推荐 / 搜索）
- 浏览 AVDB 本地资源中心
- 一键将磁力/ED2K 发送到 115 离线缓存
- 下载完成后查询 115 文件直链，在蚂蚁App内直接播放

---

## ⚡ 安装

### 从链接安装

蚂蚁App → 小程序 → 右上角 **+** → **从链接安装** → 粘贴以下地址：

```
https://cdn.jsdelivr.net/gh/graysui/avdb-mayiapp@main/manifest.json
```

---

## 使用前提

| 条件 | 说明 |
|---|---|
| AVDB 实例 | 需要公网可访问地址（内网 IP 在小程序中不可用） |
| 蚂蚁影视 App | 安装了蚂蚁App（小程序宿主） |
| 115 账号 | 需要 Cookie（UID / CID / SEID）用于文件查找和直链生成 |

---

## 首次配置

打开小程序 → 「**设置**」Tab：

| 配置项 | 说明 |
|---|---|
| AVDB 地址 | 填写 AVDB 的公网 URL，如 `http://avdb.example.com:8168` |
| API Key | 在 AVDB 控制中心 → 访问令牌 中创建 |
| 115 Cookie UID / CID / SEID | 浏览器登录 115.com → DevTools → Network → 任意请求 Cookie 中复制 |
| 115 目录 CID | 文件下载后所在目录的数字 CID |
| 保存路径 | 发送磁力到115时的 save_path，与 AVDB 下载规则一致 |

---

## 播放流程

```
在线资源/资源中心
  → 影片详情：选择磁力资源
  → 📤 发送到115（AVDB 转发到115离线）
  → 等待115离线下载完成
  → 查找文件（在115目录搜索）
  → ▶ 直链播放（获取 pick_code → downurl → player）
```

---

## 文件结构

```
├── manifest.json    appId / entry(jsDelivr) / 权限 / allowlist
├── market.json      蚂蚁市场清单
├── lib.js           核心库（Cfg / AVDB API / P115 API / Player / UI）
├── theme.css        深色主题样式
├── index.html       首页（统计 + 最新 + 排行）
├── online.html      JavDB 在线资源（最新/排行/推荐/搜索）
├── movie.html       影片详情（磁力 + 发送115 + 查找文件 + 直链播放）
├── resources.html   AVDB 本地资源中心
├── article.html     本地资源详情（磁力 + 发送115 + 查找文件 + 播放）
└── settings.html    设置页（AVDB + 115 Cookie + 连接测试）
```

---

## 注意事项

- `ant.request` 不允许访问内网 IP，AVDB 必须有**公网可访问地址**
- 115 直链有 User-Agent 校验，已在播放时自动透传
- 115 Cookie 仅存于设备本地 `ant.storage`，不上传到任何服务器
- Cookie 过期后需回设置页重新填写
