-- 文件存储表
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- 原始文件名
    original_name VARCHAR(255) NOT NULL,
    -- 存储文件名（UUID + 扩展名）
    stored_name VARCHAR(255) NOT NULL,
    -- 文件MIME类型
    mime_type VARCHAR(100) NOT NULL,
    -- 文件大小（字节）
    file_size BIGINT NOT NULL,
    -- 存储路径（相对于 upload 目录）
    storage_path VARCHAR(500) NOT NULL,
    -- 缩略图路径（仅图片）
    thumbnail_path VARCHAR(500),
    -- 上传者
    uploader_id UUID NOT NULL REFERENCES users(id),
    -- 创建时间
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_files_uploader_id ON files(uploader_id);
