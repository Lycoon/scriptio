#[tauri::command]
fn some_noop_command() {
    // This does nothing, used for a handshake check
}

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

            // iOS WKWebView inflates ("text autosizing") the editor font: the
            // screenplay page lays out at a fixed ~818px width and the phone CSS
            // scales it down with `zoom`, but WKWebView then boosts the font by
            // the column-width/viewport ratio (~2x) so 12pt renders at ~33px,
            // overflowing the fixed 16px line box. CSS can't stop it here —
            // `-webkit-text-size-adjust: none` is honoured in getComputedStyle
            // yet ignored by the autosizer — so turn the feature off natively on
            // WKPreferences via the private `textAutosizingEnabled` key (KVC).
            #[cfg(target_os = "ios")]
            {
                use tauri::Manager;
                if let Some(webview) = app.webview_windows().values().next().cloned() {
                    let _ = webview.with_webview(|wv| unsafe {
                        use objc2::msg_send;
                        use objc2::runtime::AnyObject;
                        use objc2_foundation::{NSNumber, NSString};

                        let view: *mut AnyObject = wv.inner().cast();
                        if view.is_null() {
                            return;
                        }
                        let configuration: *mut AnyObject = msg_send![view, configuration];
                        let preferences: *mut AnyObject = msg_send![configuration, preferences];
                        let disabled = NSNumber::new_bool(false);
                        let key = NSString::from_str("textAutosizingEnabled");
                        let _: () = msg_send![preferences, setValue: &*disabled, forKey: &*key];
                    });
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![some_noop_command])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
