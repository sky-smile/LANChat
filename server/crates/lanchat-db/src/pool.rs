//! 数据库连接池管理

use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

/// 创建 PostgreSQL 连接池
pub async fn create_pool(database_url: &str) -> anyhow::Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await?;

    tracing::info!("数据库连接池创建成功");
    Ok(pool)
}

/// 执行数据库迁移
pub async fn run_migrations(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::migrate!("../../migrations")
        .run(pool)
        .await?;
    tracing::info!("数据库迁移完成");
    Ok(())
}
