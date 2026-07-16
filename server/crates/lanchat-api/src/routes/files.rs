//! 文件上传和下载路由

use std::path::PathBuf;

use axum::extract::{Multipart, Path, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use uuid::Uuid;

use lanchat_common::error::ApiError;
use lanchat_common::types::ApiResponse;

use crate::error::AppError;
use crate::AppState;

/// 文件上传路由（需认证）
pub fn file_routes() -> Router<AppState> {
    Router::new()
        .route("/upload", post(upload_handler))
}

/// 文件下载路由（公开，UUID 不可猜测）
pub fn file_public_routes() -> Router<AppState> {
    Router::new()
        .route("/:file_id", get(download_handler))
        .route("/:file_id/thumbnail", get(thumbnail_handler))
}

/// 上传文件
async fn upload_handler(
    State(state): State<AppState>,
    axum::extract::Extension(user_id): axum::extract::Extension<String>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<ApiResponse<serde_json::Value>>), AppError> {
    let uid = Uuid::parse_str(&user_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的用户ID".to_string())))?;

    // 上传目录
    let upload_dir = std::env::var("UPLOAD_DIR").unwrap_or_else(|_| "./uploads".to_string());
    let upload_path = PathBuf::from(&upload_dir);

    // 确保上传目录存在
    if !upload_path.exists() {
        tokio::fs::create_dir_all(&upload_path)
            .await
            .map_err(|e| AppError(ApiError::DatabaseError(sqlx::Error::Io(e))))?;
    }

    // 处理 multipart 表单
    let mut file_data: Option<Vec<u8>> = None;
    let mut file_name: Option<String> = None;
    let mut mime_type: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError(ApiError::ValidationError(format!("读取表单字段失败: {}", e))))?
    {
        let name = field.name().unwrap_or("").to_string();

        if name == "file" {
            file_name = field.file_name().map(|s| s.to_string());
            mime_type = field.content_type().map(|s| s.to_string());

            let data = field
                .bytes()
                .await
                .map_err(|e| AppError(ApiError::ValidationError(format!("读取文件数据失败: {}", e))))?;
            file_data = Some(data.to_vec());
        }
    }

    let file_data = file_data
        .ok_or_else(|| AppError(ApiError::ValidationError("未找到文件".to_string())))?;
    let original_name = file_name.unwrap_or_else(|| "unknown".to_string());
    let mime = mime_type.unwrap_or_else(|| "application/octet-stream".to_string());

    // 生成存储文件名
    let file_id = Uuid::new_v4();
    let ext = lanchat_core::services::file::get_extension(&original_name);
    let stored_name = format!("{}.{}", file_id, ext);
    let storage_path = format!("{}/{}", upload_dir, stored_name);

    // 保存文件
    tokio::fs::write(&storage_path, &file_data)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(sqlx::Error::Io(e))))?;

    // 生成缩略图（仅图片）
    let mut thumbnail_path: Option<String> = None;
    if lanchat_core::services::file::is_image(&mime) {
        let thumb_dir = format!("{}/thumbnails", upload_dir);
        if !PathBuf::from(&thumb_dir).exists() {
            let _ = tokio::fs::create_dir_all(&thumb_dir).await;
        }

        let thumb_name = format!("{}_thumb.{}", file_id, ext);
        let thumb_full_path = format!("{}/{}", thumb_dir, thumb_name);

        let src_path = PathBuf::from(&storage_path);
        let dst_path = PathBuf::from(&thumb_full_path);

        // 在后台任务中生成缩略图，不阻塞响应
        tokio::spawn(async move {
            if let Err(e) =
                lanchat_core::services::file::generate_thumbnail(&src_path, &dst_path, 200).await
            {
                tracing::warn!("生成缩略图失败: {}", e);
            }
        });

        thumbnail_path = Some(format!("{}/{}", thumb_dir, thumb_name));
    }

    // 保存到数据库
    let file = lanchat_core::services::file::save_file_metadata(
        &state.db,
        &original_name,
        &stored_name,
        &mime,
        file_data.len() as i64,
        &storage_path,
        thumbnail_path.as_deref(),
        &uid,
    )
    .await
    .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    Ok((
        StatusCode::CREATED,
        Json(ApiResponse::success(serde_json::json!({
            "id": file.id,
            "original_name": file.original_name,
            "mime_type": file.mime_type,
            "file_size": file.file_size,
            "thumbnail_path": file.thumbnail_path,
            "created_at": file.created_at,
        }))),
    ))
}

/// 下载文件
async fn download_handler(
    State(state): State<AppState>,
    Path(file_id): Path<String>,
) -> Result<Response, AppError> {
    let fid = Uuid::parse_str(&file_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的文件ID".to_string())))?;

    let file = lanchat_core::services::file::get_file(&state.db, &fid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?
        .ok_or_else(|| AppError(ApiError::NotFound("文件不存在".to_string())))?;

    // 读取文件
    let data = tokio::fs::read(&file.storage_path)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(sqlx::Error::Io(e))))?;

    let content_type = file.mime_type.clone();
    let filename = file.original_name.clone();

    Ok((
        [
            (header::CONTENT_TYPE, content_type),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{}\"", filename),
            ),
        ],
        data,
    )
        .into_response())
}

/// 获取缩略图
async fn thumbnail_handler(
    State(state): State<AppState>,
    Path(file_id): Path<String>,
) -> Result<Response, AppError> {
    let fid = Uuid::parse_str(&file_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的文件ID".to_string())))?;

    let file = lanchat_core::services::file::get_file(&state.db, &fid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?
        .ok_or_else(|| AppError(ApiError::NotFound("文件不存在".to_string())))?;

    // 检查是否有缩略图
    let thumb_path = file
        .thumbnail_path
        .ok_or_else(|| AppError(ApiError::NotFound("缩略图不存在".to_string())))?;

    // 读取缩略图
    let data = tokio::fs::read(&thumb_path)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(sqlx::Error::Io(e))))?;

    Ok((
        [(header::CONTENT_TYPE, "image/jpeg".to_string())],
        data,
    )
        .into_response())
}
