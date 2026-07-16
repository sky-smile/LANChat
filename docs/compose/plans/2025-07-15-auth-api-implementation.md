# 服务端数据库连接 + 基础认证 API 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让客户端能真正登录——服务端连接 PostgreSQL/Redis，实现注册和登录 API，客户端联通后端。

**Architecture:** 分层架构：lanchat-db 负责连接池和迁移，lanchat-core/repository 负责数据访问，lanchat-core/services 负责业务逻辑，lanchat-api 负责 HTTP 路由和中间件。客户端通过 Vite 代理连接后端。

**Tech Stack:** Rust (Axum + SQLx + fred), PostgreSQL 16, Redis 7, React (Vite proxy)

## Global Constraints

- Rust edition 2021, rust-version 1.80
- 使用 workspace 依赖（Cargo.toml [workspace.dependencies]）
- 数据库迁移文件在 server/migrations/ 目录
- 客户端 API 基路径为 `/api`
- JWT secret 从环境变量 `JWT_SECRET` 读取
- 密码使用 Argon2 哈希

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `server/crates/lanchat-db/src/lib.rs` | 修改 | 导出 pool 和 redis 模块 |
| `server/crates/lanchat-db/src/pool.rs` | 修改 | 添加迁移执行函数 |
| `server/crates/lanchat-db/src/redis.rs` | 新建 | Redis 连接管理 |
| `server/crates/lanchat-core/src/repository/mod.rs` | 修改 | 导出 user_repository |
| `server/crates/lanchat-core/src/repository/user_repository.rs` | 新建 | User CRUD 操作 |
| `server/crates/lanchat-core/src/services/auth.rs` | 修改 | 实现真正的登录/注册逻辑 |
| `server/crates/lanchat-core/src/services/mod.rs` | 修改 | 导出模块 |
| `server/crates/lanchat-api/src/main.rs` | 修改 | 连接 DB/Redis，注册路由 |
| `server/crates/lanchat-api/src/routes/mod.rs` | 新建 | 路由模块定义 |
| `server/crates/lanchat-api/src/routes/auth.rs` | 新建 | 认证路由处理器 |
| `server/crates/lanchat-api/src/middleware/mod.rs` | 新建 | 中间件模块 |
| `server/crates/lanchat-api/src/middleware/auth.rs` | 新建 | JWT 认证中间件 |
| `server/crates/lanchat-api/src/error.rs` | 新建 | API 错误处理和响应 |
| `client/vite.config.ts` | 修改 | 添加 API 代理 |
| `client/src/stores/auth.ts` | 修改 | 改用 axios 实例 |

---

### Task 1: lanchat-db 迁移执行和 Redis 连接

**Covers:** [S2]

**Files:**
- Modify: `server/crates/lanchat-db/src/lib.rs`
- Modify: `server/crates/lanchat-db/src/pool.rs`
- Create: `server/crates/lanchat-db/src/redis.rs`

**Interfaces:**
- Produces: `pub async fn run_migrations(pool: &PgPool) -> anyhow::Result<()>`
- Produces: `pub async fn create_redis_client(redis_url: &str) -> anyhow::Result<fred::clients::RedisClient>`

- [ ] **Step 1: 修改 lanchat-db/src/lib.rs 导出模块**

```rust
//! LANChat 数据库连接管理

pub mod pool;
pub mod redis;
```

- [ ] **Step 2: 修改 pool.rs 添加迁移执行函数**

在 `server/crates/lanchat-db/src/pool.rs` 末尾添加：

```rust
/// 执行数据库迁移
pub async fn run_migrations(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::migrate!("../../migrations")
        .run(pool)
        .await?;
    tracing::info!("数据库迁移完成");
    Ok(())
}
```

- [ ] **Step 3: 创建 redis.rs**

```rust
//! Redis 连接管理

use fred::clients::RedisClient;
use fred::prelude::*;

/// 创建 Redis 客户端
pub async fn create_redis_client(redis_url: &str) -> anyhow::Result<RedisClient> {
    let config = RedisConfig::from_url(redis_url)?;
    let client = RedisClient::new(config, None, None, None);
    
    // 测试连接
    client.init().await?;
    tracing::info!("Redis 连接成功");
    Ok(client)
}
```

- [ ] **Step 4: 编译验证**

Run: `cargo check -p lanchat-db`
Expected: 编译通过

- [ ] **Step 5: 提交**

```bash
git add server/crates/lanchat-db/
git commit -m "feat(lanchat-db): 添加迁移执行和 Redis 连接管理"
```

---

### Task 2: lanchat-core User 仓储

**Covers:** [S2, S4]

**Files:**
- Modify: `server/crates/lanchat-core/src/repository/mod.rs`
- Create: `server/crates/lanchat-core/src/repository/user_repository.rs`

**Interfaces:**
- Produces: `pub async fn find_by_username(pool: &PgPool, username: &str) -> Result<Option<User>, sqlx::Error>`
- Produces: `pub async fn create_user(pool: &PgPool, username: &str, password_hash: &str, display_name: Option<&str>) -> Result<User, sqlx::Error>`

- [ ] **Step 1: 修改 repository/mod.rs**

```rust
//! 数据访问层

pub mod user_repository;
```

- [ ] **Step 2: 创建 user_repository.rs**

```rust
//! 用户数据访问

use sqlx::PgPool;
use uuid::Uuid;
use crate::models::User;

/// 按用户名查找用户
pub async fn find_by_username(pool: &PgPool, username: &str) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, display_name, avatar_url, department, role, status, last_seen_at, created_at, updated_at FROM users WHERE username = $1"
    )
    .bind(username)
    .fetch_optional(pool)
    .await
}

/// 创建用户
pub async fn create_user(
    pool: &PgPool,
    username: &str,
    password_hash: &str,
    display_name: Option<&str>,
) -> Result<User, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "INSERT INTO users (username, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, username, password_hash, display_name, avatar_url, department, role, status, last_seen_at, created_at, updated_at"
    )
    .bind(username)
    .bind(password_hash)
    .bind(display_name)
    .fetch_one(pool)
    .await
}
```

- [ ] **Step 3: 编译验证**

Run: `cargo check -p lanchat-core`
Expected: 编译通过

- [ ] **Step 4: 提交**

```bash
git add server/crates/lanchat-core/src/repository/
git commit -m "feat(lanchat-core): 实现 User 仓储层"
```

---

### Task 3: lanchat-core 认证服务实现

**Covers:** [S2, S4]

**Files:**
- Modify: `server/crates/lanchat-core/src/services/auth.rs`
- Modify: `server/crates/lanchat-core/src/services/mod.rs`

**Interfaces:**
- Consumes: `user_repository::find_by_username`, `user_repository::create_user`
- Consumes: `lanchat_common::auth::{hash_password, verify_password, generate_token}`
- Produces: `pub async fn login(pool: &PgPool, username: &str, password: &str, jwt_secret: &str) -> Result<LoginResponse, ApiError>`
- Produces: `pub async fn register(pool: &PgPool, username: &str, password: &str, display_name: Option<&str>, jwt_secret: &str) -> Result<LoginResponse, ApiError>`

- [ ] **Step 1: 修改 services/mod.rs**

```rust
//! 业务服务层

pub mod auth;
```

- [ ] **Step 2: 重写 services/auth.rs**

```rust
//! 认证服务

use sqlx::PgPool;
use lanchat_common::auth;
use lanchat_common::error::ApiError;
use crate::models::User;
use crate::repository;

/// 登录请求
#[derive(Debug, serde::Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

/// 注册请求
#[derive(Debug, serde::Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
    pub display_name: Option<String>,
}

/// 登录/注册响应
#[derive(Debug, serde::Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: User,
}

/// 用户登录
pub async fn login(
    pool: &PgPool,
    username: &str,
    password: &str,
    jwt_secret: &str,
) -> Result<AuthResponse, ApiError> {
    // 查找用户
    let user = repository::user_repository::find_by_username(pool, username)
        .await?
        .ok_or(ApiError::AuthError(lanchat_common::error::AuthError::InvalidCredentials))?;

    // 验证密码
    if !auth::verify_password(password, &user.password_hash) {
        return Err(ApiError::AuthError(lanchat_common::error::AuthError::InvalidCredentials));
    }

    // 生成 Token
    let token = auth::generate_token(&user.id.to_string(), jwt_secret)?;

    Ok(AuthResponse { token, user })
}

/// 用户注册
pub async fn register(
    pool: &PgPool,
    username: &str,
    password: &str,
    display_name: Option<&str>,
    jwt_secret: &str,
) -> Result<AuthResponse, ApiError> {
    // 检查用户名是否已存在
    if repository::user_repository::find_by_username(pool, username)
        .await?
        .is_some()
    {
        return Err(ApiError::ValidationError("用户名已存在".to_string()));
    }

    // 哈希密码
    let password_hash = auth::hash_password(password)?;

    // 创建用户
    let user = repository::user_repository::create_user(pool, username, &password_hash, display_name).await?;

    // 生成 Token
    let token = auth::generate_token(&user.id.to_string(), jwt_secret)?;

    Ok(AuthResponse { token, user })
}
```

- [ ] **Step 3: 编译验证**

Run: `cargo check -p lanchat-core`
Expected: 编译通过

- [ ] **Step 4: 提交**

```bash
git add server/crates/lanchat-core/src/services/
git commit -m "feat(lanchat-core): 实现认证服务（登录/注册）"
```

---

### Task 4: lanchat-api 错误处理和中间件

**Covers:** [S2, S3]

**Files:**
- Create: `server/crates/lanchat-api/src/error.rs`
- Create: `server/crates/lanchat-api/src/middleware/mod.rs`
- Create: `server/crates/lanchat-api/src/middleware/auth.rs`

**Interfaces:**
- Consumes: `lanchat_common::error::ApiError`
- Consumes: `lanchat_common::auth::verify_token`
- Produces: `pub struct AppState { pub db: PgPool, pub redis: RedisClient, pub jwt_secret: String }`
- Produces: `pub async fn auth_layer(...)` — JWT 认证中间件

- [ ] **Step 1: 创建 error.rs**

```rust
//! API 错误处理

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use lanchat_common::error::ApiError;
use lanchat_common::types::ApiResponse;

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            ApiError::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
            ApiError::ValidationError(msg) => (StatusCode::BAD_REQUEST, msg),
            ApiError::DatabaseError(e) => {
                tracing::error!("数据库错误: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "服务器内部错误".to_string())
            }
            ApiError::AuthError(e) => (StatusCode::UNAUTHORIZED, e.to_string()),
            ApiError::InternalError(msg) => {
                tracing::error!("内部错误: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "服务器内部错误".to_string())
            }
        };

        let body = ApiResponse::<()>::error(status.as_u16() as i32, message);
        (status, Json(body)).into_response()
    }
}
```

- [ ] **Step 2: 创建 middleware/mod.rs**

```rust
//! 中间件模块

pub mod auth;
```

- [ ] **Step 3: 创建 middleware/auth.rs**

```rust
//! JWT 认证中间件

use axum::extract::State;
use axum::http::Request;
use axum::middleware::Next;
use axum::response::Response;
use lanchat_common::auth::verify_token;
use lanchat_common::error::ApiError;

/// 从请求中提取 Bearer Token
fn extract_token(request: &Request<axum::body::Body>) -> Option<String> {
    let auth_header = request.headers().get("authorization")?;
    let auth_str = auth_header.to_str().ok()?;
    auth_str.strip_prefix("Bearer ").map(|s| s.to_string())
}

/// JWT 认证中间件
pub async fn auth_middleware(
    State(state): State<crate::AppState>,
    mut request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, ApiError> {
    let token = extract_token(&request)
        .ok_or(ApiError::AuthError(lanchat_common::error::AuthError::Unauthorized))?;
    
    let claims = verify_token(&token, &state.jwt_secret)
        .map_err(|e| ApiError::AuthError(e))?;
    
    // 将 user_id 插入 request extensions
    request.extensions_mut().insert(claims.sub);
    
    Ok(next.run(request).await)
}
```

- [ ] **Step 4: 编译验证**

Run: `cargo check -p lanchat-api`
Expected: 编译通过

- [ ] **Step 5: 提交**

```bash
git add server/crates/lanchat-api/src/error.rs server/crates/lanchat-api/src/middleware/
git commit -m "feat(lanchat-api): 添加错误处理和 JWT 认证中间件"
```

---

### Task 5: lanchat-api 认证路由

**Covers:** [S2, S3, S4]

**Files:**
- Create: `server/crates/lanchat-api/src/routes/mod.rs`
- Create: `server/crates/lanchat-api/src/routes/auth.rs`

**Interfaces:**
- Consumes: `lanchat_core::services::auth::{login, register, LoginRequest, RegisterRequest}`
- Consumes: `AppState` (from Task 4)
- Produces: `pub fn auth_routes() -> Router<AppState>`

- [ ] **Step 1: 创建 routes/mod.rs**

```rust
//! 路由模块

pub mod auth;
```

- [ ] **Step 2: 创建 routes/auth.rs**

```rust
//! 认证路由

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use axum::routing::{get, post};
use axum::Router;
use lanchat_common::types::ApiResponse;

use crate::middleware::auth::auth_middleware;
use crate::AppState;
use lanchat_core::services::auth::{self, AuthResponse, LoginRequest, RegisterRequest};

/// 认证路由
pub fn auth_routes() -> Router<AppState> {
    Router::new()
        .route("/login", post(login_handler))
        .route("/register", post(register_handler))
        .route("/me", get(me_handler).layer(axum::middleware::from_fn_with_state(
            AppState::default(), // 占位，main.rs 中会用真实 state
            auth_middleware,
        )))
}

/// 登录处理
async fn login_handler(
    State(state): State<AppState>,
    Json(request): Json<LoginRequest>,
) -> Result<(StatusCode, Json<ApiResponse<AuthResponse>>), crate::error::ApiError> {
    let response = auth::login(&state.db, &request.username, &request.password, &state.jwt_secret).await?;
    Ok((StatusCode::OK, Json(ApiResponse::success(response))))
}

/// 注册处理
async fn register_handler(
    State(state): State<AppState>,
    Json(request): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<ApiResponse<AuthResponse>>), crate::error::ApiError> {
    let response = auth::register(
        &state.db,
        &request.username,
        &request.password,
        request.display_name.as_deref(),
        &state.jwt_secret,
    ).await?;
    Ok((StatusCode::CREATED, Json(ApiResponse::success(response))))
}

/// 获取当前用户信息
async fn me_handler(
    State(state): State<AppState>,
    axum::extract::Extension(user_id): axum::extract::Extension<String>,
) -> Result<Json<ApiResponse<lanchat_core::models::User>>, crate::error::ApiError> {
    let user = sqlx::query_as::<_, lanchat_core::models::User>(
        "SELECT id, username, password_hash, display_name, avatar_url, department, role, status, last_seen_at, created_at, updated_at FROM users WHERE id = $1"
    )
    .bind(uuid::Uuid::parse_str(&user_id).map_err(|e| crate::error::ApiError::AuthError(lanchat_common::error::AuthError::TokenError(e.to_string())))?)
    .fetch_optional(&state.db)
    .await?
    .ok_or(crate::error::ApiError::NotFound("用户不存在".to_string()))?;
    
    Ok(Json(ApiResponse::success(user)))
}
```

- [ ] **Step 3: 编译验证**

Run: `cargo check -p lanchat-api`
Expected: 编译通过

- [ ] **Step 4: 提交**

```bash
git add server/crates/lanchat-api/src/routes/
git commit -m "feat(lanchat-api): 实现认证路由（登录/注册/获取用户信息）"
```

---

### Task 6: lanchat-api 主入口重写

**Covers:** [S2, S3]

**Files:**
- Modify: `server/crates/lanchat-api/src/main.rs`
- Modify: `server/crates/lanchat-api/src/lib.rs` (如果存在)

**Interfaces:**
- Consumes: `lanchat_db::pool::{create_pool, run_migrations}`
- Consumes: `lanchat_db::redis::create_redis_client`
- Consumes: `routes::auth::auth_routes`
- Consumes: `AppState` (from Task 4)

- [ ] **Step 1: 重写 main.rs**

```rust
use axum::Router;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod error;
mod middleware;
mod routes;

/// 应用状态
#[derive(Clone, Default)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub redis: fred::clients::RedisClient,
    pub jwt_secret: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 初始化日志
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "lanchat_api=debug,tower_http=debug".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // 加载环境变量
    dotenvy::dotenv().ok();

    // 读取配置
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL 必须设置");
    let redis_url = std::env::var("REDIS_URL").expect("REDIS_URL 必须设置");
    let jwt_secret = std::env::var("JWT_SECRET").expect("JWT_SECRET 必须设置");
    let server_host = std::env::var("SERVER_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let server_port = std::env::var("SERVER_PORT").unwrap_or_else(|_| "3000".to_string());

    // 连接数据库
    let db_pool = lanchat_db::pool::create_pool(&database_url).await?;
    
    // 执行迁移
    lanchat_db::pool::run_migrations(&db_pool).await?;

    // 连接 Redis
    let redis_client = lanchat_db::redis::create_redis_client(&redis_url).await?;

    // 构建应用状态
    let state = AppState {
        db: db_pool,
        redis: redis_client,
        jwt_secret,
    };

    // CORS 配置
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // 构建路由
    let app = Router::new()
        .route("/health", axum::routing::get(|| async { "OK" }))
        .nest("/api/auth", routes::auth::auth_routes())
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    // 启动服务器
    let addr = format!("{}:{}", server_host, server_port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("服务器启动在 http://{}", addr);
    axum::serve(listener, app).await?;

    Ok(())
}
```

- [ ] **Step 2: 编译验证**

Run: `cargo check -p lanchat-api`
Expected: 编译通过

- [ ] **Step 3: 提交**

```bash
git add server/crates/lanchat-api/src/main.rs
git commit -m "feat(lanchat-api): 重写主入口，连接数据库和 Redis"
```

---

### Task 7: 客户端 Vite 代理配置

**Covers:** [S3]

**Files:**
- Modify: `client/vite.config.ts`

**Interfaces:**
- 代理 `/api` 到 `http://localhost:3000`

- [ ] **Step 1: 修改 vite.config.ts 添加代理**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Tauri 相关配置
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
```

- [ ] **Step 2: 验证**

Run: `cd client && pnpm dev`，访问 http://localhost:1420，打开浏览器开发工具 Network 标签，确认 `/api` 请求被代理到 3000 端口

- [ ] **Step 3: 提交**

```bash
git add client/vite.config.ts
git commit -m "feat(client): 添加 Vite API 代理配置"
```

---

### Task 8: 客户端 auth store 改用 axios

**Covers:** [S3]

**Files:**
- Modify: `client/src/stores/auth.ts`

**Interfaces:**
- Consumes: `services/api.ts` (axios 实例)

- [ ] **Step 1: 修改 auth.ts**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/services/api';

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  department?: string;
  role: string;
  status: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

interface LoginResponse {
  token: string;
  user: User;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      login: async (username: string, password: string) => {
        const response = await api.post<LoginResponse>('/auth/login', {
          username,
          password,
        });

        const { token, user } = response.data.data!;
        set({
          token,
          user,
          isAuthenticated: true,
        });
      },

      logout: () => {
        set({
          token: null,
          user: null,
          isAuthenticated: false,
        });
      },

      setUser: (user: User) => {
        set({ user });
      },
    }),
    {
      name: 'auth-storage',
    },
  ),
);
```

- [ ] **Step 2: 验证**

确保 TypeScript 编译通过：`cd client && pnpm tsc --noEmit`

- [ ] **Step 3: 提交**

```bash
git add client/src/stores/auth.ts
git commit -m "feat(client): auth store 改用 axios 实例"
```

---

### Task 9: 端到端验证

**Covers:** [S2, S3, S4]

**Files:** 无新文件

**Interfaces:** 无

- [ ] **Step 1: 启动 Docker 服务**

```bash
cd /home/sky/GitHub/LANChat
docker compose up -d postgres redis
```

等待服务就绪（约 10 秒）

- [ ] **Step 2: 创建 .env 文件**

```bash
cp server/.env.example server/.env
```

确认 `.env` 内容：
```
DATABASE_URL=postgres://lanchat:lanchat123@localhost:5432/lanchat
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev_secret_key_for_testing_only
SERVER_HOST=0.0.0.0
SERVER_PORT=3000
RUST_LOG=info,lanchat_api=debug
```

- [ ] **Step 3: 启动服务端**

```bash
cd /home/sky/GitHub/LANChat/server
cargo run -p lanchat-api
```

预期输出：
```
INFO 数据库连接池创建成功
INFO 数据库迁移完成
INFO Redis 连接成功
INFO 服务器启动在 http://0.0.0.0:3000
```

- [ ] **Step 4: 测试健康检查**

```bash
curl http://localhost:3000/health
```
预期：`OK`

- [ ] **Step 5: 测试注册**

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123","display_name":"管理员"}'
```
预期：返回 JSON 包含 token 和 user 信息

- [ ] **Step 6: 测试登录**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```
预期：返回 JSON 包含 token 和 user 信息

- [ ] **Step 7: 测试获取用户信息**

使用上一步返回的 token：
```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <token>"
```
预期：返回当前用户信息

- [ ] **Step 8: 启动客户端验证登录流程**

```bash
cd /home/sky/GitHub/LANChat/client
pnpm dev
```

访问 http://localhost:1420/login，使用 admin/admin123 登录，预期跳转到主页

- [ ] **Step 9: 最终提交**

```bash
git add -A
git commit -m "feat: 完成服务端数据库连接和基础认证 API"
```
