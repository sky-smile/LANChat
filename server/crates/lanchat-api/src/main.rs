use axum::{routing::get, Router};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 初始化日志
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_rng().unwrap_or_else(|_| "lanchat_api=debug,tower_http=debug".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // 加载环境变量
    dotenvy::dotenv().ok();

    // 构建路由
    let app = Router::new()
        .route("/health", get(health_check))
        .layer(TraceLayer::new_for_http());

    // 启动服务器
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    tracing::info!("服务器启动在 http://0.0.0.0:3000");
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> &'static str {
    "OK"
}
