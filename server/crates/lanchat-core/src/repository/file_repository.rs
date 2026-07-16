//! 文件存储仓库

use sqlx::PgPool;
use uuid::Uuid;

use crate::models::File;

/// 保存文件元数据
pub async fn create(
    pool: &PgPool,
    original_name: &str,
    stored_name: &str,
    mime_type: &str,
    file_size: i64,
    storage_path: &str,
    thumbnail_path: Option<&str>,
    uploader_id: &Uuid,
) -> Result<File, sqlx::Error> {
    let file = sqlx::query_as::<_, File>(
        r#"
        INSERT INTO files (original_name, stored_name, mime_type, file_size, storage_path, thumbnail_path, uploader_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        "#,
    )
    .bind(original_name)
    .bind(stored_name)
    .bind(mime_type)
    .bind(file_size)
    .bind(storage_path)
    .bind(thumbnail_path)
    .bind(uploader_id)
    .fetch_one(pool)
    .await?;

    Ok(file)
}

/// 根据ID查找文件
pub async fn find_by_id(pool: &PgPool, file_id: &Uuid) -> Result<Option<File>, sqlx::Error> {
    let file = sqlx::query_as::<_, File>(
        r#"
        SELECT * FROM files WHERE id = $1
        "#,
    )
    .bind(file_id)
    .fetch_optional(pool)
    .await?;

    Ok(file)
}

/// 获取用户上传的文件列表
pub async fn list_by_uploader(
    pool: &PgPool,
    uploader_id: &Uuid,
    limit: i64,
) -> Result<Vec<File>, sqlx::Error> {
    let files = sqlx::query_as::<_, File>(
        r#"
        SELECT * FROM files
        WHERE uploader_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        "#,
    )
    .bind(uploader_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(files)
}
