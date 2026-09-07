use std::sync::Mutex;

use tauri::{Emitter, Manager};

/// Event carrying a `.scriptio` path the OS asked us to open. The frontend
/// listens for it and routes the path into the merge-aware open flow.
const OPEN_FILE_EVENT: &str = "scriptio://open-file";

/// Paths handed to us before the webview was listening.
///
/// A launch-with-file arrives in `argv` during `setup`, long before the frontend
/// has mounted and subscribed, so emitting alone would drop it on the floor.
/// Every path is therefore queued as well as emitted, and the frontend drains
/// the queue once on mount — belt and braces, since the two paths (cold launch,
/// already running) are otherwise identical from JS.
#[derive(Default)]
struct PendingOpens(Mutex<Vec<String>>);

#[tauri::command]
fn some_noop_command() {
    // This does nothing, used for a handshake check
}

/// Drain the paths queued before the frontend was listening.
#[tauri::command]
fn take_pending_open_files(state: tauri::State<'_, PendingOpens>) -> Vec<String> {
    match state.0.lock() {
        Ok(mut pending) => std::mem::take(&mut *pending),
        Err(_) => Vec::new(),
    }
}

/// Grant the frontend permission to write this file's scratch sibling, and say
/// where it is.
///
/// Saving a `.scriptio` re-emits the whole archive, so it is written beside the
/// target and renamed over it — a rename is atomic, a truncated archive is not
/// recoverable. But the file dialog grants scope for exactly the one path the
/// user picked, and the scratch file is not that path, so the write is refused
/// ("forbidden path: …scriptio.part").
///
/// Granting it here rather than widening the capability keeps the rule intact:
/// the scratch sibling is allowed only for a target the user has *already*
/// granted through a dialog, so this can never reach a file they never chose.
/// The alternative — a `**/*.part` scope entry — would hand the frontend write
/// access to matching names anywhere on disk.
#[tauri::command]
fn allow_scratch_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    use tauri_plugin_fs::FsExt;

    let target = std::path::PathBuf::from(&path);
    let scope = app.fs_scope();

    if !scope.is_allowed(&target) {
        return Err(format!("path was not granted by the user: {path}"));
    }

    // `<name>.scriptio` → `<name>.scriptio.part`, kept as a sibling so the
    // rename stays on one filesystem (a cross-device rename is a copy, and
    // loses the atomicity this exists for).
    let mut scratch = target.into_os_string();
    scratch.push(".part");
    let scratch = std::path::PathBuf::from(scratch);

    scope
        .allow_file(&scratch)
        .map_err(|e| format!("could not grant the scratch path: {e}"))?;

    Ok(scratch.to_string_lossy().into_owned())
}

/// Read `len` bytes at `offset` from a granted file.
///
/// Opening a bound project needs small slices of a possibly enormous file — the
/// header, the index pages it chains through, and individual blocks — and
/// `plugin-fs`'s `readFile` only offers the whole thing. On a project carrying
/// gigabytes of board images, reading it all to look at a few kilobytes of index
/// is the cost this whole design exists to avoid.
///
/// A short read at the end of the file is not an error: the caller asks for a
/// fixed-size tail without knowing whether the file is that long.
#[tauri::command]
fn read_file_range(
    app: tauri::AppHandle,
    path: String,
    offset: u64,
    len: u32,
) -> Result<tauri::ipc::Response, String> {
    use std::io::{Read, Seek, SeekFrom};
    use tauri_plugin_fs::FsExt;

    let target = std::path::PathBuf::from(&path);
    if !app.fs_scope().is_allowed(&target) {
        return Err(format!("path was not granted by the user: {path}"));
    }

    let mut file = std::fs::File::open(&target).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;

    let mut buffer = vec![0u8; len as usize];
    let mut filled = 0usize;
    while filled < buffer.len() {
        match file.read(&mut buffer[filled..]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(e) => return Err(e.to_string()),
        }
    }
    buffer.truncate(filled);

    // `Response`, not `Vec<u8>`: a command returning a plain vector is serialised
    // as a JSON array of numbers, so a megabyte of index would cross the bridge
    // as several megabytes of text and arrive as a million-element JS array.
    // This hands the webview an ArrayBuffer instead.
    Ok(tauri::ipc::Response::new(buffer))
}

/// Write `bytes` at `offset` and flush them to disk.
///
/// The incremental save is two of these. First the new blocks go at the end of
/// the file with `truncate` set, which both extends it and drops any tail a
/// previous interrupted save left behind. Then the commit record goes into its
/// fixed slot *without* truncating, and that second write is the commit: it is
/// the only thing that makes the new blocks reachable.
///
/// Ordering is the whole safety argument, and it needs both writes to be durable
/// in order — hence `sync_all` on each rather than once at the end. Between them
/// the file holds blocks nothing points at, which is exactly the state a crash
/// should leave: the commit record still in force is the *other* slot, describing
/// the project as it was.
#[tauri::command]
fn write_file_at(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    use std::io::{Seek, SeekFrom, Write};
    use tauri_plugin_fs::FsExt;

    // The bytes are the whole payload rather than a field beside the others,
    // because that is the only shape Tauri sends as a raw body — anything nested
    // in a JSON object is re-encoded as an array of numbers, which for a board
    // image means megabytes of text per save. The scalars ride in headers, and
    // the path is percent-encoded so a filename outside ASCII survives the trip.
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes,
        _ => return Err("write_file_at expects a raw body".into()),
    };

    let header = |name: &str| -> Result<String, String> {
        request
            .headers()
            .get(name)
            .ok_or_else(|| format!("missing {name} header"))?
            .to_str()
            .map(|value| value.to_owned())
            .map_err(|e| e.to_string())
    };

    let path = percent_encoding::percent_decode_str(&header("x-path")?)
        .decode_utf8()
        .map_err(|e| e.to_string())?
        .into_owned();
    let offset: u64 = header("x-offset")?.parse().map_err(|_| "bad offset")?;
    let truncate = header("x-truncate")? == "1";

    let target = std::path::PathBuf::from(&path);
    if !app.fs_scope().is_allowed(&target) {
        return Err(format!("path was not granted by the user: {path}"));
    }

    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .open(&target)
        .map_err(|e| e.to_string())?;

    file.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())?;
    if truncate {
        file.set_len(offset + bytes.len() as u64).map_err(|e| e.to_string())?;
    }
    file.sync_all().map_err(|e| e.to_string())?;
    Ok(())
}

fn is_project_file(path: &str) -> bool {
    path.to_lowercase().ends_with(".scriptio")
}

/// Queue a path and tell the frontend about it.
fn queue_open_file(app: &tauri::AppHandle, path: String) {
    if !is_project_file(&path) {
        return;
    }
    if let Some(state) = app.try_state::<PendingOpens>() {
        if let Ok(mut pending) = state.0.lock() {
            pending.push(path.clone());
        }
    }
    let _ = app.emit(OPEN_FILE_EVENT, path);
}

/// Bring the existing window forward — a second launch should surface the app
/// the user already has open, not sit invisibly behind it.
///
/// Desktop only: `unminimize` sits in a `#[cfg(desktop)]` impl block, so leaving
/// this compiled on mobile breaks the iOS build even though nothing calls it
/// there (both call sites are already desktop-gated).
#[cfg(desktop)]
fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Without this, double-clicking a second `.scriptio` on Windows and Linux
    // starts a whole new instance with its own IndexedDB-backed session, and two
    // copies of the same project would then write over each other's file. The
    // second process forwards its argv here and exits.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        focus_main_window(app);
        for arg in argv.iter().skip(1) {
            queue_open_file(app, arg.clone());
        }
    }));

    let builder = builder
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init());

    // ORDER IS LOAD-BEARING: this must come after `tauri_plugin_fs`.
    //
    // Its setup reads that plugin's scope through `try_fs_scope()`, and when the
    // fs plugin has not been registered yet that returns None — whereupon the
    // plugin does nothing at all: no restore, no save listener, and only an
    // eprintln in debug builds to say so. Registered too early it looks present
    // and is inert, and the symptom lands somewhere else entirely: a file-backed
    // project comes back after a restart having lost permission to its own file.
    //
    // What it buys us: the fs scope grant a save/open dialog hands out covers
    // only that session, so without persistence every binding dies on quit.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_persisted_scope::init());

    let app = builder
        .manage(PendingOpens::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Launched by double-clicking a file (Windows/Linux pass the path in
            // argv; macOS uses RunEvent::Opened below instead).
            #[cfg(desktop)]
            for arg in std::env::args().skip(1) {
                queue_open_file(app.handle(), arg);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            some_noop_command,
            take_pending_open_files,
            allow_scratch_file,
            read_file_range,
            write_file_at
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, event| {
        // macOS never uses argv for documents: the Finder sends an Apple Event,
        // which Tauri surfaces here. It fires for the launching document too, so
        // this covers both cold launch and open-while-running on that platform.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = &event {
            focus_main_window(app_handle);
            for url in urls {
                if let Ok(path) = url.to_file_path() {
                    queue_open_file(app_handle, path.to_string_lossy().into_owned());
                }
            }
        }

        let _ = (app_handle, event);
    });
}
