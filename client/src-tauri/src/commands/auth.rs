use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// 获取 token 存储路径
fn token_path(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .expect("无法获取应用数据目录");
    fs::create_dir_all(&dir).ok();
    dir.join(".auth_token")
}

/// 保存认证 token 到本地文件
#[tauri::command]
pub fn save_token(app: AppHandle, token: String) -> Result<(), String> {
    let path = token_path(&app);
    fs::write(&path, &token).map_err(|e| format!("保存 token 失败: {}", e))
}

/// 读取本地存储的认证 token
#[tauri::command]
pub fn load_token(app: AppHandle) -> Result<Option<String>, String> {
    let path = token_path(&app);
    if path.exists() {
        fs::read_to_string(&path)
            .map(Some)
            .map_err(|e| format!("读取 token 失败: {}", e))
    } else {
        Ok(None)
    }
}

/// 清除本地存储的认证 token
#[tauri::command]
pub fn clear_token(app: AppHandle) -> Result<(), String> {
    let path = token_path(&app);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("清除 token 失败: {}", e))
    } else {
        Ok(())
    }
}
