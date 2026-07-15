# 局域网聊天软件项目规划

## 项目概述
开发一款面向企业内部的局域网聊天软件，支持Docker部署服务器，Windows客户端安装使用。账号由管理员统一创建和管理，提供完整的即时通讯和语音通话功能。

## 核心需求
1. **用户管理**：管理员创建/管理账号，用户资料管理
2. **群组管理**：创建/解散群组，成员管理，群公告
3. **即时通讯**：文字消息、图片、表情、文件传输
4. **语音通话**：一对一语音、多人语音通话
5. **部署方式**：服务器Docker容器化部署，客户端Windows安装包

## 为什么选择 Rust 服务端

| 优势 | 说明 |
|------|------|
| **极致性能** | 零成本抽象，无 GC 停顿，WebSocket 高并发下延迟极低 |
| **内存安全** | 编译期内存安全保证，无空指针、无数据竞争 |
| **低资源占用** | 单个二进制文件，内存占用远低于 Node.js/Java，适合中小规模部署 |
| **类型安全** | 编译期捕获大量 Bug，重构信心强 |
| **单二进制部署** | Docker 镜像极小（~20MB），启动秒级 |
| **Tokio 生态** | 异步运行时成熟，WebSocket/数据库/Redis 全异步 |

## 技术栈选型

### 服务器端（Rust）
| 组件 | 技术选择 | 理由 |
|------|----------|------|
| 语言 | Rust 1.80+ | 内存安全、零成本抽象、极致性能、低资源占用 |
| 异步运行时 | Tokio 1.x | Rust 生态事实标准，高性能异步运行时 |
| Web框架 | Axum | Tokio 官方出品，类型安全，中间件生态好 |
| 实时通信 | axum::extract::ws + 自定义协议 | 原生 WebSocket 支持，轻量高效 |
| WebRTC信令 | 自定义 WebSocket 信令 | 与消息系统集成，减少外部依赖 |
| 数据库 | PostgreSQL 16 + SQLx | 异步、编译时 SQL 检查，类型安全 |
| ORM/查询 | SeaORM（可选） | 若需 ORM 抽象，SQLx 已足够轻量 |
| 缓存 | Redis 7 + fred | 异步 Redis 客户端，支持集群 |
| 文件存储 | 本地存储 + Nginx静态服务 | 局域网内部署，简单高效 |
| 认证 | JWT + Argon2 | 无状态认证，Argon2 比 bcrypt 更安全 |
| 序列化 | serde + serde_json | Rust 生态标准，零开销序列化 |
| 日志 | tracing + tracing-subscriber | 结构化日志，支持分布式追踪 |

### 客户端（Tauri 2.0）
| 组件 | 技术选择 | 理由 |
|------|----------|------|
| 框架 | Tauri 2.0 + React 18 | 极轻量（~5MB），后端 Rust 可与服务端共享代码 |
| 系统 WebView | WebView2（Windows 10/11 预装） | 无需额外依赖，系统级性能 |
| 后端语言 | Rust（Tauri 原生） | 与服务端共享协议定义、数据模型、验证逻辑 |
| 状态管理 | Zustand | 轻量级，TypeScript 友好 |
| UI组件库 | Ant Design | 企业级组件，中文支持好 |
| WebRTC | 原生 WebRTC API（WebView2 支持） | 系统 WebView 原生支持 |
| 构建工具 | Vite | 快速开发体验 |
| 安装包格式 | NSIS / MSI | Windows 原生安装体验 |

### 基础设施
| 组件 | 技术选择 | 理由 |
|------|----------|------|
| 容器化 | Docker + Docker Compose | 一键部署，环境隔离 |
| 反向代理 | Nginx | 静态文件服务，负载均衡 |
| TURN/STUN | coturn | 局域网内NAT穿透，语音通话必需 |

## 系统架构

```mermaid
graph TB
    subgraph "客户端层 (Tauri 2.0)"
        A[Windows 客户端 ~5MB]
        A1[React 前端 (WebView2)]
        A2[Rust 后端 (Tauri)]
        A --- A1
        A --- A2
    end
    
    subgraph "Rust 服务层 (单二进制)"
        B[Nginx反向代理]
        C[Axum HTTP API]
        D[WebSocket 服务]
        E[WebRTC 信令]
    end
    
    subgraph "数据层"
        F[(PostgreSQL)]
        G[(Redis)]
        H[文件存储]
    end
    
    subgraph "基础设施"
        I[coturn TURN服务器]
        J[Docker网络]
    end
    
    A -->|HTTPS/WSS| B
    B -->|HTTP| C
    B -->|WebSocket| D
    D -->|信令| E
    C -->|SQLx| F
    C -->|fred| G
    D -->|fred| G
    E -->|fred| G
    C --> H
    A -->|WebRTC| I
    A -->|WebRTC| A
```

## 功能模块详细设计

### 1. 用户管理模块
- **管理员功能**：
  - 批量创建用户（CSV导入）
  - 用户启用/禁用
  - 重置密码
  - 部门/角色管理
- **用户功能**：
  - 个人资料编辑（头像、昵称、状态）
  - 在线状态设置（在线、离开、忙碌、离线）
  - 个人设置（通知、主题、语言）

### 2. 群组管理模块
- **群组类型**：
  - 普通群（最多500人）
  - 部门群（自动同步组织架构）
  - 公告群（只读，仅管理员发言）
- **群组功能**：
  - 创建/解散群组
  - 成员邀请/移除
  - 群公告管理
  - 群文件共享
  - 群管理员设置

### 3. 即时通讯模块
- **消息类型**：
  - 文本消息（支持@提及、链接预览）
  - 图片消息（压缩、缩略图、原图查看）
  - 表情消息（内置表情包、自定义表情）
  - 文件消息（断点续传、进度显示）
  - 系统消息（加入/退出群组、消息撤回）
- **消息特性**：
  - 消息已读/未读状态
  - 消息撤回（2分钟内）
  - 消息引用
  - 消息搜索
  - 历史消息漫游

### 4. 语音通话模块
- **一对一通话**：
  - 基于WebRTC的点对点连接
  - 通话质量自适应（码率调整）
  - 通话状态显示（振铃、通话中、结束）
- **多人通话**：
  - 支持最多9人同时通话
  - 使用Mesh架构（适合局域网低延迟环境）
  - 发言者高亮显示
  - 静音/取消静音
  - 通话录制（可选）

### 5. 通知系统
- **桌面通知**：Windows原生通知
- **声音通知**：新消息、来电提示音
- **消息免打扰**：全局/针对特定群组

## Rust 服务端与 Tauri 客户端共享代码

由于服务端和客户端都使用 Rust，可以创建共享 crate：

```
shared/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── protocol.rs     # WebSocket 消息协议定义
    ├── models.rs       # 数据模型（User, Group, Message）
    ├── validation.rs   # 输入验证逻辑
    └── constants.rs    # 共享常量
```

**共享收益**：
- 协议定义只写一次，两端自动保持同步
- 数据模型序列化/反序列化逻辑复用
- 验证规则统一，避免前后端不一致
- 类型安全的 IPC 通信

## Rust 服务端项目结构

```
server/
├── Cargo.toml                    # Workspace 根配置
├── Cargo.lock
├── Dockerfile                    # 多阶段构建
├── .env.example
├── migrations/                   # SQLx 数据库迁移
│   ├── 001_create_users.sql
│   ├── 002_create_groups.sql
│   └── 003_create_messages.sql
├── crates/
│   ├── lanchat-api/              # HTTP API 服务
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs           # 入口，启动 Axum 服务
│   │       ├── config.rs         # 配置加载（环境变量）
│   │       ├── error.rs          # 统一错误类型
│   │       ├── routes/
│   │       │   ├── mod.rs
│   │       │   ├── auth.rs       # 认证路由
│   │       │   ├── users.rs      # 用户管理路由
│   │       │   ├── groups.rs     # 群组管理路由
│   │       │   ├── messages.rs   # 消息路由
│   │       │   └── files.rs      # 文件上传/下载路由
│   │       ├── handlers/         # 路由处理器
│   │       ├── middleware/       # 认证中间件、日志中间件
│   │       └── ws/
│   │           ├── mod.rs
│   │           ├── handler.rs    # WebSocket 连接处理
│   │           ├── signaling.rs  # WebRTC 信令
│   │           └── protocol.rs   # 消息协议定义
│   ├── lanchat-core/             # 核心业务逻辑
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── models/           # 数据模型（User, Group, Message）
│   │       ├── services/         # 业务服务层
│   │       └── repository/       # 数据访问层
│   ├── lanchat-db/               # 数据库连接和迁移
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── pool.rs           # 连接池管理
│   │       └── migrations.rs     # 迁移执行
│   └── lanchat-common/           # 共享工具和类型
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── auth.rs           # JWT + Argon2 工具
│           ├── types.rs          # 共享类型定义
│           └── config.rs         # 通用配置
└── tests/                        # 集成测试
    ├── api_tests.rs
    └── ws_tests.rs
```

## 客户端项目结构（Tauri 2.0 + React）

```
client/
├── Cargo.toml                    # Tauri Rust 后端
├── tauri.conf.json               # Tauri 配置（窗口、权限、打包）
├── capabilities/                 # Tauri v2 权限声明
│   └── default.json
├── src-tauri/                    # Rust 后端代码
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs               # Tauri 入口
│   │   ├── lib.rs                # Tauri 命令定义
│   │   ├── commands/             # Tauri IPC 命令
│   │   │   ├── auth.rs           # 登录/认证
│   │   │   ├── file.rs           # 文件操作（上传/下载/存储）
│   │   │   ├── audio.rs          # 音频设备管理
│   │   │   └── notification.rs   # 系统通知
│   │   ├── state.rs              # 应用状态管理
│   │   └── tray.rs               # 系统托盘
│   ├── icons/                    # 应用图标
│   └── build.rs
├── src/                          # React 前端代码
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── Chat/                 # 聊天组件
│   │   ├── Contacts/             # 联系人/群组
│   │   ├── VoiceCall/            # 语音通话 UI
│   │   └── Settings/             # 设置页面
│   ├── hooks/
│   │   ├── useWebSocket.ts       # WebSocket 连接
│   │   ├── useWebRTC.ts          # WebRTC 通话
│   │   └── useTauriCommand.ts    # 调用 Rust 后端
│   ├── services/
│   │   ├── api.ts                # HTTP API 客户端
│   │   ├── ws.ts                 # WebSocket 客户端
│   │   └── signaling.ts          # WebRTC 信令
│   ├── stores/
│   │   ├── auth.ts               # 认证状态
│   │   ├── chat.ts               # 聊天状态
│   │   └── contacts.ts           # 联系人状态
│   ├── types/
│   └── utils/
├── public/
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

## 数据库设计

### 核心表结构
```sql
-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    avatar_url VARCHAR(500),
    department VARCHAR(100),
    role VARCHAR(20) DEFAULT 'user',
    status VARCHAR(20) DEFAULT 'offline',
    last_seen_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 群组表
CREATE TABLE groups (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    avatar_url VARCHAR(500),
    type VARCHAR(20) DEFAULT 'normal',
    max_members INT DEFAULT 500,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 消息表
CREATE TABLE messages (
    id UUID PRIMARY KEY,
    sender_id UUID REFERENCES users(id),
    receiver_id UUID, -- 用户ID或群组ID
    receiver_type VARCHAR(10), -- 'user' 或 'group'
    content TEXT,
    message_type VARCHAR(20), -- 'text', 'image', 'file', 'system'
    metadata JSONB, -- 文件信息、图片尺寸等
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 开发阶段规划

### 第一阶段：基础架构（3-4周）
1. **项目初始化**
   - 创建 Cargo workspace（服务端 monorepo）
   - 配置 Rust 工具链、clippy、rustfmt
   - 客户端配置 TypeScript、ESLint、Prettier
   - 设置 Docker 开发环境
2. **Rust 服务器基础**
   - Axum 服务器搭建（路由、中间件、错误处理）
   - SQLx 数据库连接和迁移
   - 基础认证系统（JWT + Argon2）
   - 统一错误类型和响应格式
3. **客户端基础**
   - Tauri 2.0 + React 项目搭建
   - 基础 UI 框架
   - 路由和状态管理
   - Rust ↔ JS IPC 通信机制

### 第二阶段：核心功能（3-4周）
1. **用户系统**
   - 管理员后台 API
   - 用户登录/资料管理
2. **即时通讯**
   - Tokio WebSocket 连接管理
   - 一对一聊天（消息路由、持久化）
   - 群组聊天（房间管理、广播）
   - 消息类型实现
3. **文件传输**
   - Axum multipart 文件上传/下载
   - 图片压缩和预览

### 第三阶段：语音通话（2-3周）
1. **WebRTC集成**
   - 信令服务器实现
   - 一对一通话
2. **多人通话**
   - Mesh网络实现
   - 通话状态管理
3. **通话优化**
   - 音频处理（降噪、回声消除）
   - 网络适应性

### 第四阶段：高级功能（2-3周）
1. **通知系统**
   - 桌面通知
   - 声音提醒
2. **消息增强**
   - 消息搜索
   - 历史记录
   - 消息撤回
3. **管理功能**
   - 用户管理增强
   - 群组管理增强
   - 数据统计

### 第五阶段：测试和部署（2周）
1. **测试**
   - Rust 单元测试 + 集成测试（cargo test）
   - 客户端端到端测试
   - 性能测试（cargo bench）
2. **部署**
   - 多阶段 Docker 镜像构建（最终镜像仅含二进制）
   - 部署脚本
   - 文档编写

## 部署架构

### Docker Compose 配置示例
```yaml
version: '3.8'

services:
  # PostgreSQL 数据库
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: lanchat
      POSTGRES_USER: lanchat
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  # Redis 缓存
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  # Rust API 服务器
  api:
    build:
      context: ./server
      dockerfile: Dockerfile
    environment:
      DATABASE_URL: postgres://lanchat:${DB_PASSWORD}@postgres:5432/lanchat
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      RUST_LOG: info,lanchat_server=debug
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis

  # Nginx 反向代理
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d
      - ./frontend/dist:/usr/share/nginx/html
    depends_on:
      - api

  # TURN 服务器 (语音通话)
  coturn:
    image: coturn/coturn
    ports:
      - "3478:3478"
      - "3478:3478/udp"
      - "5349:5349"
      - "5349:5349/udp"
    volumes:
      - ./coturn/turnserver.conf:/etc/coturn/turnserver.conf

volumes:
  postgres_data:
```

## Rust 服务端 Dockerfile（多阶段构建）

```dockerfile
# 阶段1：构建
FROM rust:1.80-bookworm as builder
WORKDIR /app
COPY . .
RUN cargo build --release --bin lanchat-api

# 阶段2：运行（仅含二进制，镜像极小）
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/lanchat-api /usr/local/bin/
EXPOSE 3000
CMD ["lanchat-api"]
```

## 客户端构建与分发

Tauri 打包为 Windows 安装包（NSIS/MSI），体积约 5-10MB：

```bash
# 开发环境
cd client
pnpm tauri dev

# 构建生产版本
pnpm tauri build
# 输出：client/src-tauri/target/release/bundle/
#   ├── LANChat_1.0.0_x64-setup.exe   (NSIS 安装包)
#   └── LANChat_1.0.0_x64_en-US.msi   (MSI 安装包)
```

**分发方式**：
- 局域网文件共享 / 内部 HTTP 服务器下载
- 管理员通过组策略 (GPO) 批量推送安装
- 配置自动更新服务器（Tauri 内置 updater 插件）

## 安全考虑

1. **网络安全**
   - 全站HTTPS/WSS
   - 局域网IP白名单（可选）
   - 防火墙配置

2. **数据安全**
   - 密码 Argon2 加密（比 bcrypt 更抗 GPU 攻击）
   - JWT定期轮换
   - 敏感配置环境变量

3. **通信安全**
   - WebRTC DTLS/SRTP加密
   - 消息传输TLS加密
   - 文件传输加密

4. **访问控制**
   - 基于角色的权限管理
   - API速率限制
   - 登录失败锁定

## 性能优化

1. **消息系统**
   - 消息分页加载
   - 本地消息缓存
   - 图片懒加载

2. **语音通话**
   - 音频编码优化（Opus）
   - 网络抖动缓冲
   - 带宽自适应

3. **文件传输**
   - 分片上传
   - 断点续传
   - 文件去重

## 监控和维护

1. **日志系统**
   - 结构化日志（JSON格式）
   - 日志级别配置
   - 日志轮转

2. **监控指标**
   - 在线用户数
   - 消息吞吐量
   - 服务器资源使用

3. **备份策略**
   - 数据库定期备份
   - 文件存储备份
   - 配置备份

## 团队协作建议

1. **开发流程**
   - Git Flow分支策略
   - 代码审查
   - 自动化CI/CD

2. **文档**
   - API文档（Swagger/OpenAPI）
   - 部署文档
   - 用户手册

## 风险评估

1. **技术风险**
   - Rust 开发周期相对较长，但运行时性能和稳定性更优
   - WebView2 兼容性（Windows 10 1803+ 均支持，覆盖范围广）
   - 局域网网络环境复杂性
   - 多人通话性能瓶颈

2. **项目风险**
   - 功能范围蔓延
   - 语音通话质量不稳定
   - 用户接受度
   - Rust 开发者招聘难度（可考虑外包或培训）

## 后续扩展

1. **功能扩展**
   - 移动端支持（React Native）
   - 视频通话
   - 屏幕共享
   - 集成企业现有系统（OA、HR）

2. **性能扩展**
   - 消息分库分表
   - CDN加速
   - 集群部署

## 时间估算

总计：12-17周（3-4.25个月）

- 基础架构：3-4周（Rust 服务端 + Tauri 客户端可共享 crate）
- 核心功能：3-4周
- 语音通话：2-3周
- 高级功能：2-3周
- 测试部署：2周

## 下一步行动

1. 确认技术栈选择
2. 搭建开发环境
3. 创建项目结构
4. 开始第一阶段开发

---

*本规划基于企业局域网环境设计，可根据实际需求调整功能和优先级。*