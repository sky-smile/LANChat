# LANChat 修复计划

> 基于代码审计生成的可执行修复计划。按 **P0/P1/P2** 分级，每行末尾标注预计工时（人日）。

---

## 第一阶段：P0 致命问题（立即修复，预计 3-4 天）

### 1. 修复生产环境 WebSocket 连接地址
**文件**：`client/src/hooks/useWebSocket.ts:269-271`
**问题**：Tauri 生产包中 `window.location.host` 指向前端本地，不会指向后端 API。
**修复**：
- 在 `.env` / `.env.production` 中定义后端地址，例如 `VITE_API_URL=https://lanchat-server:3000`
- 生产环境读取该变量：
  ```ts
  const wsHost = import.meta.env.DEV ? '127.0.0.1:3000' : (import.meta.env.VITE_API_URL || window.location.host);
  ```
- 同步修改 `client/src/services/api.ts:4` 的 `baseURL`，生产环境使用完整 URL。
**工时**：0.5d

### 2. 修复生产环境文件/图片 URL
**文件**：`client/src/components/Chat.tsx:306-307`、`322-323`
**修复**：
- 封装 `getFileUrl(fileId: string, type?: 'thumbnail')` 工具函数，根据环境拼接完整地址。
- 图片点击下载建议改用 Tauri `shell:open`（如果保留 `shell:allow-open`）或新标签页打开绝对地址。
**工时**：0.5d

### 3. 修复 WebSocket 同用户重连清理逻辑
**文件**：`server/crates/lanchat-api/src/routes/ws.rs:92-99`、`137-141`
**修复**：
- 用 `Arc<mpsc::UnboundedSender<Message>>` 作为 map 值，断开时比较指针；或引入连接 token（UUID）。
- 清理时只有当前 token 与 map 中一致才移除。
**工时**：0.5d

### 4. 修复创建群组后创建者未加入群组
**文件**：`server/crates/lanchat-core/src/repository/group_repository.rs:10-32`、`server/crates/lanchat-api/src/routes/groups.rs:65-90`
**修复**：
- 在 `create_group` 事务中创建群组后，立即把 `created_by` 作为 `owner` 插入 `group_members`。
- 路由层无需改动。
**工时**：0.5d

### 5. 配置 Tauri CSP
**文件**：`client/src-tauri/tauri.conf.json:25-27`
**修复**：设置合理的 CSP，示例：
```json
"csp": "default-src 'self'; connect-src 'self' ws: wss: http: https:; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self';"
```
**工时**：0.25d

### 6. 修复 docker-compose 编排
**文件**：`docker-compose.yml`、`docker/nginx/conf.d/default.conf`
**修复**：
- 新增 `api` 服务，使用 `server/Dockerfile` 构建，依赖 postgres/redis。
- 将 nginx 的 WebSocket 路径从 `/ws/` 改为 `/api/ws/`，与后端路由一致：
  ```nginx
  location /api/ws {
      proxy_pass http://api:3000/api/ws;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_read_timeout 86400;
  }
  ```
- 可选：新增 `coturn` 服务（P1 细化）。
**工时**：1d

### 7. 创建 `.env.example`
**文件**：新增 `server/.env.example`、`client/.env.example`
**内容示例**：
```bash
# server/.env.example
DATABASE_URL=postgres://lanchat:lanchat123@localhost:5432/lanchat
REDIS_URL=redis://localhost:6379
JWT_SECRET=change_me_in_production
SERVER_HOST=0.0.0.0
SERVER_PORT=3000
UPLOAD_DIR=./uploads

# client/.env.example
VITE_API_URL=http://localhost:3000
```
**工时**：0.25d

---

## 第二阶段：P1 高危问题（预计 4-5 天）

### 8. 修复 JWT 单元测试编译错误
**文件**：`server/crates/lanchat-common/src/auth.rs:85-92`
**修复**：
```rust
let token = generate_token(user_id, "user", secret).unwrap();
```
**工时**：0.25d

### 9. 修复数据库迁移 `gen_random_uuid`
**文件**：`server/migrations/004_create_files.sql:3`
**修复**：改为 `uuid_generate_v4()` 或新增 `CREATE EXTENSION IF NOT EXISTS pgcrypto;`。
**工时**：0.25d

### 10. 群历史消息增加成员校验
**文件**：`server/crates/lanchat-api/src/routes/messages.rs:30-55`
**修复**：
- `target_type == "group"` 时调用 `lanchat_core::services::group::is_member`。
- 非成员返回 403。
**工时**：0.5d

### 11. 限制群成员移除权限
**文件**：`server/crates/lanchat-api/src/routes/groups.rs:358-391`
**修复**：
- 仅当操作者为 admin、群主（`group_members.role == 'owner'`）或目标是自己时才允许移除。
- 移除群主需先转让群主或解散群组。
**工时**：0.5d

### 12. 通话信令增加参与方校验
**文件**：`server/crates/lanchat-api/src/routes/ws.rs:424-523`
**修复**：
- `handle_call_accept/reject/hangup` 校验 `payload.user_id` / `user_id` 是否在 `active_calls` 中。
- `handle_call_sdp_forward / handle_call_ice_forward` 增加 call_id 校验，仅转发给当前通话的对方/参与者。
**工时**：1d

### 13. 处理删除用户外键约束
**文件**：`server/crates/lanchat-api/src/routes/admin.rs:216-242`
**修复**：
- 方案 A：迁移中加 `ON DELETE SET NULL`（`messages.sender_id`、`files.uploader_id`、`groups.created_by`）。
- 方案 B：删除前将关联数据迁移或清理。
- 保留方案 A 更简洁，同时注意 `messages.content` 业务上是否允许 sender 为空。
**工时**：0.75d

### 14. 修复缩略图生成时序
**文件**：`server/crates/lanchat-api/src/routes/files.rs:99-115`
**修复**：
- 图片上传后同步等待缩略图生成完成再返回；使用 `tokio::task::spawn_blocking` 处理 `image` 库 CPU 操作。
- 生成失败时返回无缩略图的响应，不写入错误路径。
**工时**：0.75d

### 15. 收紧 CORS 配置
**文件**：`server/crates/lanchat-api/src/main.rs:82-85`
**修复**：生产环境从环境变量读取允许 origin，开发环境保持宽松。
**工时**：0.25d

### 16. 优化 401 处理
**文件**：`client/src/services/api.ts:38-42`
**修复**：
- 区分 token 过期、被踢、服务端异常。
- token 过期时刷新或跳转登录；被踢时提示“账号在别处登录”。
**工时**：0.5d

### 17. 修复提示音开关
**文件**：`client/src/utils/notification.ts:14`、`client/src/hooks/useWebSocket.ts:166`、`client/src/components/Settings.tsx`
**修复**：
- `playMessageSound()` 读取 `localStorage` 的开关状态。
- 或用 zustand 状态传入。
**工时**：0.25d

---

## 第三阶段：P2 优化与功能补齐（预计 8-10 天）

### 18. 服务端文件上传大小限制
**文件**：`server/crates/lanchat-api/src/routes/files.rs`、`server/crates/lanchat-api/src/main.rs:99-104`
**修复**：在文件路由上加 `axum::extract::DefaultBodyLimit::max(50 * 1024 * 1024)`。
**工时**：0.25d

### 19. WebSocket 消息发送失败处理
**文件**：`client/src/hooks/useWebSocket.ts:337-341`
**修复**：
- 未连接时入队，连接成功后按顺序发送。
- 发送失败返回 Promise reject，UI 显示重发按钮。
**工时**：1d

### 20. 聊天窗口智能滚动
**文件**：`client/src/components/Chat.tsx:58-60`
**修复**：
- 记录滚动位置，仅当用户在底部或自己发送消息时才滚动到底部。
**工时**：0.5d

### 21. 历史消息分页加载
**文件**：`client/src/components/Chat.tsx:70-71`、`server/crates/lanchat-core/src/services/message.rs`、`server/crates/lanchat-core/src/repository/message_repository.rs`
**修复**：
- 前端增加 `before` 参数，滚动到顶部触发加载更早消息。
- 后端 SQL 已实现 `before`，但前端未传。
**工时**：1d

### 22. 添加 React Error Boundary
**文件**：新增 `client/src/components/ErrorBoundary.tsx`，修改 `client/src/main.tsx`
**工时**：0.5d

### 23. 登出清理聊天状态
**文件**：`client/src/stores/auth.ts:70-76`
**修复**：`logout()` 中调用 `useChatStore.getState().reset()` 并清除 `chat-storage`。
**工时**：0.25d

### 24. 部署私有 TURN/STUN
**文件**：`client/src/hooks/useWebRTC.ts:8-12`、`docker-compose.yml`
**修复**：
- 部署 coturn，通过环境变量将 TURN 地址/凭证注入客户端。
- 替换 Google 公共 STUN。
**工时**：2d

### 25. 重构 `isGroup` 定义位置
**文件**：`client/src/components/Chat.tsx:180`、`356`
**修复**：将 `const isGroup = ...` 移到组件顶部。
**工时**：0.1d

### 26. WebRTC 远端音频元素管理
**文件**：`client/src/hooks/useWebRTC.ts:80-89`
**修复**：
- 使用 React ref 管理 audio 元素，离开通话时统一清理。
**工时**：0.5d

### 27. 移除模块级可变变量
**文件**：`client/src/hooks/useWebRTC.ts:15-19`
**修复**：
- 使用 React Context 或 Tauri 命令暴露通话能力，避免模块级 `_initiateCallRef`。
**工时**：1d

### 28. 补齐 Tauri Rust 后端能力
**文件**：`client/src-tauri/src/lib.rs`、`client/src-tauri/src/commands/`
**修复**：
- 实现 `auth.rs`、`file.rs`、`audio.rs`、`notification.rs`。
- 实现系统托盘 `tray.rs`。
- 前端从直接 HTTP 逐步迁移到调用 Tauri 命令（优先文件/通知）。
**工时**：3d

### 29. 建立共享协议/模型 crate
**文件**：新增 `shared/` 或 `server/crates/lanchat-protocol`
**修复**：
- 将协议定义、模型、验证逻辑下沉到共享 crate。
- 客户端 Tauri Rust 后端依赖该 crate，前端 TypeScript 类型从 JSON Schema 生成或手动同步。
**工时**：2d

### 30. 测试覆盖
**文件**：`server/`、`client/`
**修复**：
- 服务端：修复现有测试后，补 auth、group、message、ws 单元/集成测试。
- 客户端：增加 Vitest 单元测试，覆盖 stores 和 hooks。
**工时**：3d

---

## 执行顺序建议

| 周次 | 目标 | 包含项 |
|------|------|--------|
| 第 1 周 | 可生产运行 | 1-7（P0） |
| 第 2 周 | 安全加固 | 8-17（P1） |
| 第 3-4 周 | 体验优化 + 架构补齐 | 18-30（P2） |

---

## 验证清单

- [ ] `cargo test` 编译并通过。
- [ ] `cargo clippy` 无警告。
- [ ] `pnpm lint` 通过。
- [ ] `docker compose up` 可一键启动 postgres + redis + api + nginx。
- [ ] Tauri 生产包可连接后端 WebSocket 并收发消息。
- [ ] 生产包内图片/文件可正常下载。
- [ ] 同一账号重连后仍能正常接收消息。
- [ ] 管理员创建群组后能在列表中看到自己创建的群。
- [ ] 非群成员无法读取群历史消息。
- [ ] 普通成员无法移除群主。
- [ ] 通话信令无法被第三方伪造。

---

*生成时间：2026-07-23*
