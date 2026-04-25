# 联机五子棋 (Gomoku)

一个部署在 Cloudflare 上的简单联机五子棋小游戏。朋友间通过房间号匹配对战。

## 架构

```
┌──────────────────┐         ┌──────────────────────────┐
│  Cloudflare      │  HTTP   │  Cloudflare Worker       │
│  Pages           │ ──────> │  └─ Durable Object       │
│  (web/dist)      │  WS     │     (一个房间一个实例)    │
└──────────────────┘ <──────>└──────────────────────────┘
```

- **前端**：Vite + React + Canvas（`web/`）
- **后端**：Cloudflare Worker + Durable Object，使用 WebSocket Hibernation API（`worker/`）
- **存储**：Durable Object 内置 SQLite 持久化（断线/休眠后状态不丢）
- **成本**：免费额度内（朋友间对战流量极低）

## 目录

```
.
├── web/        # 前端（Vite）
├── worker/     # 后端（Cloudflare Worker + DO）
└── README.md
```

## 本地开发

需要 Node.js ≥ 18。

```bash
# 安装依赖
cd worker && npm install
cd ../web && npm install

# 终端 A：启动后端（端口 8787）
cd worker && npm run dev

# 终端 B：启动前端（端口 5173，自动代理 /api 到后端）
cd web && npm run dev
```

打开 http://localhost:5173 ，开两个浏览器窗口（或一个浏览器一个无痕）就能本地两人对战。

### Smoke test

`worker/smoke-test.mjs` 是一个 WebSocket 烟雾测试脚本：模拟两个玩家加入并完成一盘棋。

```bash
cd worker && node smoke-test.mjs
```

## 部署到 Cloudflare

### 1. 部署 Worker（后端）

```bash
cd worker
npx wrangler login        # 浏览器登录 Cloudflare 账号
npx wrangler deploy       # 部署
```

部署成功后会得到一个地址，例如：`https://gomoku-worker.<你的子域>.workers.dev`

> 第一次部署 Durable Object 时，Cloudflare 会自动应用 `wrangler.toml` 里的 `[[migrations]]`。

### 2. 部署前端到 Cloudflare Pages

把项目推到 GitHub，然后在 Cloudflare Dashboard：

1. **Workers & Pages → Create → Pages → Connect to Git**
2. 选择仓库
3. **Build settings**：
   - Framework preset: `Vite`
   - Build command: `cd web && npm install && npm run build`
   - Build output directory: `web/dist`
   - Root directory: 留空（仓库根）
4. **Environment variables**（Production + Preview 都要加）：
   - `VITE_API_BASE` = 上一步部署得到的 Worker 地址（如 `https://gomoku-worker.xxx.workers.dev`）
5. 保存并部署。

部署完成后访问 `https://<你的项目>.pages.dev` 即可。

> 提示：如果你想前后端用同一个域名，可以在 Worker 上绑定一个自定义域名（比如 `api.yourdomain.com`），然后把 `VITE_API_BASE` 改成它。

## 玩法

- 创建房间 → 把房间号或链接发给朋友
- 朋友输入房间号或打开链接即可加入
- 黑方先手，5 子连珠（横/纵/斜）获胜
- **手机端两步落子**：先点位置（看到半透明预览）→ 再点同一位置或"确认落子"按钮才真的下子，避免误触
- 支持悔棋（对方需同意）、认输、再来一局（自动交换黑白）

## 一些技术细节

- **WebSocket Hibernation**：每个房间是一个 DO 实例，使用 `ctx.acceptWebSocket()` 让连接空闲时休眠，几乎不计算 compute duration
- **断线重连**：客户端基于 `localStorage` 的 `playerId` 自动重连并恢复对局
- **服务端权威**：所有落子合法性、胜负判定都在服务端，客户端只负责渲染
- **每个房间独立持久化**：DO storage 存了完整 `GameState`，重启/休眠都不丢

## 限制 / 未实现

- 没有用户系统（昵称仅本地保存）
- 没有 ELO/排行榜
- 没有禁手规则（用的是无禁手自由规则）
- 同时只允许 2 个玩家进入一个房间，第三人变观战
