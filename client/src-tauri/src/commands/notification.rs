use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

/// 发送系统桌面通知
#[tauri::command]
pub fn send_notification(
    app: AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| format!("发送通知失败: {}", e))
}

/// 检查通知权限
#[tauri::command]
pub fn check_notification_permission(app: AppHandle) -> Result<String, String> {
    app.notification()
        .permission_state()
        .map(|s| format!("{:?}", s))
        .map_err(|e| format!("检查通知权限失败: {}", e))
}

/// 请求通知权限
#[tauri::command]
pub fn request_notification_permission(app: AppHandle) -> Result<bool, String> {
    app.notification()
        .request_permission()
        .map(|_| true)
        .map_err(|e| format!("请求通知权限失败: {}", e))
}
