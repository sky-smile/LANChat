mod commands;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // 设置系统托盘
            commands::tray::setup_tray(app.handle())
                .map_err(|e| e.to_string())
                .expect("设置系统托盘失败");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 认证
            commands::auth::save_token,
            commands::auth::load_token,
            commands::auth::clear_token,
            // 文件
            commands::file::save_file_dialog,
            commands::file::reveal_in_folder,
            commands::file::read_file_base64,
            // 通知
            commands::notification::send_notification,
            commands::notification::check_notification_permission,
            commands::notification::request_notification_permission,
            // 托盘
            commands::tray::toggle_window,
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}
