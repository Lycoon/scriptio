#[tauri::command]
fn some_noop_command() {
    // This does nothing, used for a handshake check
}

// NOTE on the iOS "inflated font" bug (paged mode, 16px → ~18.7px): this was
// WebKit's smart minimum font size (minimumLogicalFontSize = 9), which clamps
// `specifiedSize × zoom` up to a rendered 9px whenever the specified size is
// ≥ 9px — reported as 9 / zoom ≈ 18.7px. It is NOT text autosizing, so the
// former native `_setTextAutosizingEnabled:` workaround here was a no-op (and
// private API, an App Store risk). The real fix is CSS-side: the phone paged
// view scales with transform: scale() instead of `zoom`, which never enters
// the clamp's code path. See the paged-mode rule in EditorPanel.module.css.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![some_noop_command])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
