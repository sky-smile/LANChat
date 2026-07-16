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