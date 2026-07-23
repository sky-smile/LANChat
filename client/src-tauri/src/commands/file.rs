use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

/// 保存文件到用户选择的位置
/// 前端传入文件名和 base64 编码的内容，弹出系统保存对话框
#[tauri::command]
pub fn save_file_dialog(
    app: AppHandle,
    file_name: String,
    content_base64: String,
) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

    let bytes = BASE64
        .decode(&content_base64)
        .map_err(|e| format!("Base64 解码失败: {}", e))?;

    // 使用 dialog 插件打开保存对话框
    let file_path = app.dialog()
        .file()
        .set_file_name(&file_name)
        .blocking_save_file();

    match file_path {
        Some(path) => {
            let path_buf = path.into_path()
                .map_err(|e| format!("路径转换失败: {}", e))?;
            std::fs::write(&path_buf, &bytes)
                .map_err(|e| format!("写入文件失败: {}", e))?;
            Ok(path_buf.to_string_lossy().to_string())
        }
        None => Err("用户取消了保存".to_string()),
    }
}

/// 在系统文件管理器中显示文件
#[tauri::command]
pub fn reveal_in_folder(file_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &file_path])
            .spawn()
            .map_err(|e| format!("打开文件管理器失败: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &file_path])
            .spawn()
            .map_err(|e| format!("打开 Finder 失败: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        // 尝试用 xdg-open 打开所在目录
        let path = std::path::Path::new(&file_path);
        let dir = path.parent().unwrap_or(path);
        std::process::Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map_err(|e| format!("打开文件管理器失败: {}", e))?;
    }

    Ok(())
}

/// 获取文件的 base64 编码内容（用于读取本地文件）
#[tauri::command]
pub fn read_file_base64(file_path: String) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

    let bytes = std::fs::read(&file_path).map_err(|e| format!("读取文件失败: {}", e))?;
    Ok(BASE64.encode(&bytes))
}
