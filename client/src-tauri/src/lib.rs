use tauri::Manager;

// Tauri 命令示例
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! 欢迎使用 LANChat!", name)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}
