use axum::Router;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod error;
mod middleware;
mod routes;

/// 通话信息
#[derive(Clone, Debug)]
pub struct CallInfo {
    pub caller_id: String,
    pub callee_id: String,
}

/// 群组通话信息
#[derive(Clone, Debug)]
pub struct GroupCallInfo {
    /// 群组 ID
    pub group_id: String,
    /// 发起方用户 ID
    pub creator_id: String,
    /// 参与者列表：user_id -> user_name
    pub participants: HashMap<String, String>,
}

/// 应用状态
#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub redis: fred::clients::RedisClient,
    pub jwt_secret: String,
    pub connections: routes::ws::Connections,
    /// 活跃通话映射：call_id -> CallInfo
    pub active_calls: Arc<RwLock<HashMap<String, CallInfo>>>,
    /// 活跃群组通话映射：call_id -> GroupCallInfo
    pub active_group_calls: Arc<RwLock<HashMap<String, GroupCallInfo>>>,
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
        connections: routes::ws::create_connections(),
        active_calls: Arc::new(RwLock::new(HashMap::new())),
        active_group_calls: Arc::new(RwLock::new(HashMap::new())),
    };

    // CORS 配置
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // 构建路由
    // 公开路由（不需要认证）
    let public_routes = Router::new()
        .route("/health", axum::routing::get(|| async { "OK" }))
        .route("/api/ws", axum::routing::get(routes::ws::ws_handler))
        .nest("/api/auth", routes::auth::auth_routes())
        .nest("/api/storage", routes::files::file_public_routes());

    // 受保护路由（需要认证）
    let protected_routes = Router::new()
        .nest("/api/auth", routes::auth::auth_protected_routes())
        .nest("/api/messages", routes::messages::message_routes())
        .nest("/api/groups", routes::groups::group_routes())
        .nest("/api/files", routes::files::file_routes())
        .route_layer(axum::middleware::from_fn_with_state(
            state.clone(),
            middleware::auth::auth_middleware,
        ));

    // 管理员路由（需要认证 + 管理员权限）
    let admin_routes = Router::new()
        .nest("/api/admin", routes::admin::admin_routes())
        .route_layer(axum::middleware::from_fn_with_state(
            state.clone(),
            middleware::admin::admin_middleware,
        ))
        .route_layer(axum::middleware::from_fn_with_state(
            state.clone(),
            middleware::auth::auth_middleware,
        ));

    let app = public_routes
        .merge(protected_routes)
        .merge(admin_routes)
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
