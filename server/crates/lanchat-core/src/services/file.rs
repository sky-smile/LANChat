//! 文件服务

use std::path::Path;
use uuid::Uuid;

use image::GenericImageView;

use crate::models::File;
use crate::repository::file_repository;

/// 保存文件元数据到数据库
pub async fn save_file_metadata(
    pool: &sqlx::PgPool,
    original_name: &str,
    stored_name: &str,
    mime_type: &str,
    file_size: i64,
    storage_path: &str,
    thumbnail_path: Option<&str>,
    uploader_id: &Uuid,
) -> Result<File, sqlx::Error> {
    file_repository::create(
        pool,
        original_name,
        stored_name,
        mime_type,
        file_size,
        storage_path,
        thumbnail_path,
        uploader_id,
    )
    .await
}

/// 获取文件信息
pub async fn get_file(pool: &sqlx::PgPool, file_id: &Uuid) -> Result<Option<File>, sqlx::Error> {
    file_repository::find_by_id(pool, file_id).await
}

/// 生成缩略图（仅图片）
pub async fn generate_thumbnail(
    image_path: &Path,
    thumbnail_path: &Path,
    max_size: u32,
) -> Result<(), image::ImageError> {
    let img = image::open(image_path)?;

    // 计算缩放比例，保持宽高比
    let (width, height) = img.dimensions();
    let ratio = f64::from(max_size) / f64::from(width.max(height));
    let new_width = (f64::from(width) * ratio).round() as u32;
    let new_height = (f64::from(height) * ratio).round() as u32;

    // 缩放图片
    let thumbnail = img.resize(new_width, new_height, image::imageops::FilterType::Lanczos3);

    // 保存缩略图
    thumbnail.save(thumbnail_path)?;

    Ok(())
}

/// 获取文件扩展名
pub fn get_extension(filename: &str) -> String {
    Path::new(filename)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("bin")
        .to_lowercase()
}

/// 根据MIME类型判断是否为图片
pub fn is_image(mime_type: &str) -> bool {
    mime_type.starts_with("image/")
}
