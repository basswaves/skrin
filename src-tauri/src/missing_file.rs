//! A file that is not there when Play is pressed (round 12b, a tester's
//! proposal): Skrin looks for it before saying anything.
//!
//! The library learns of a move only at the next scan (`following.rs` pairs
//! it then). Pressed before that, Play used to open the player on nothing and
//! say "it may have been moved or deleted". Now the page asks first
//! ([`locate`]):
//!
//! - **Here**: nothing to say, the film plays.
//! - **Offline**: the drive or share its library folder is on cannot be
//!   reached (gone, or an empty mount point, as `scanner::scan_root` treats
//!   it). That is not a deletion, so nothing is offered that would forget it.
//! - **Moved**: exactly one file of the same name and size in the library
//!   folders. Same size *and* name, never a name alone: "a wrong match is
//!   worse than none" — handing one file's watched state to another is worse
//!   than asking. Two or more is **Several**, and Skrin does not pick.
//! - **NotFound**: the page offers Find it… (the system's file picker), Remove
//!   from library, Cancel.
//!
//! [`relink`] moves the row onto the file found or picked, so watched state,
//! the resume point, the match and track choices stay with it, as a scan's
//! pairing would. [`remove`] does now what the next scan would: the row is
//! marked missing, and comes back with its history if the file does. Nothing
//! here writes to the media folders.

use crate::library::{comparable, is_within, Db};
use crate::scanner::{seen_file, videos_under};
use crate::util::{now_secs, to_string_err};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::Path;
use tauri::Manager;

/// Where a library file is, as far as a look at the disk can tell.
#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum Whereabouts {
    Here,
    /// The one file of the same name and size elsewhere in the library folders.
    Moved { path: String, folder: String },
    /// The drive or share of its library folder cannot be reached.
    Offline { place: String },
    /// More than one file of its name and size: none is picked.
    Several { count: usize },
    NotFound,
}

/// What the search needs, read from the library with the lock held briefly.
#[derive(Debug, Clone)]
pub struct Facts {
    path: String,
    file_name: String,
    size: i64,
    root: String,
    roots: Vec<String>,
}

pub fn facts(conn: &Connection, file_id: i64) -> Result<Facts, String> {
    let (path, file_name, size, root): (String, String, i64, String) = conn
        .query_row(
            "SELECT m.path, m.file_name, m.size_bytes, r.path
               FROM media_files m JOIN library_roots r ON r.id = m.root_id
              WHERE m.id = ?1",
            [file_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .map_err(|_| "That file is no longer in the library.".to_string())?;
    let mut stmt = conn.prepare("SELECT path FROM library_roots ORDER BY id").map_err(to_string_err)?;
    let roots = stmt
        .query_map([], |r| r.get(0))
        .map_err(to_string_err)?
        .collect::<rusqlite::Result<_>>()
        .map_err(to_string_err)?;
    Ok(Facts { path, file_name, size, root, roots })
}

/// Whether a library folder can be reached: listed, and not empty. An empty
/// folder where a disk or share is mounted is what it looks like unmounted.
fn reachable(root: &str) -> bool {
    if crate::netshare::is_share_path(root) {
        return !videos_under(root).is_empty();
    }
    std::fs::read_dir(root).is_ok_and(|mut entries| entries.next().is_some())
}

/// Look for the file. Reads the disk only; may take a while over a big
/// library or a share, so never with the database lock held.
pub fn locate(facts: &Facts) -> Whereabouts {
    // A share Skrin opens itself is not a path the system can look at: the
    // player tries it, as before.
    if crate::netshare::is_share_path(&facts.path) || Path::new(&facts.path).is_file() {
        return Whereabouts::Here;
    }
    if !reachable(&facts.root) {
        return Whereabouts::Offline { place: facts.root.clone() };
    }
    if facts.size <= 0 {
        return Whereabouts::NotFound;
    }
    let mut found: Vec<(String, String)> = Vec::new();
    for root in &facts.roots {
        if *root != facts.root && !reachable(root) {
            continue;
        }
        for file in videos_under(root) {
            if file.size == facts.size
                && file.file_name.to_lowercase() == facts.file_name.to_lowercase()
                && file.path != facts.path
                && !found.iter().any(|(p, _)| *p == file.path)
            {
                found.push((file.path, file.parent_dir));
            }
        }
    }
    match found.len() {
        0 => Whereabouts::NotFound,
        1 => {
            let (path, folder) = found.remove(0);
            Whereabouts::Moved { path, folder }
        }
        count => Whereabouts::Several { count },
    }
}

/// The library file `file_id` is now `new_path`: its row takes the new path,
/// with everything that hangs on it. A row the scan already made for the new
/// path (no history of its own yet, or a second copy) goes; the older row
/// wins, as `following::move_root` does.
pub fn relink(conn: &mut Connection, file_id: i64, new_path: &str) -> Result<(), String> {
    let new = seen_file(Path::new(new_path))
        .ok_or_else(|| "That is not a video file Skrin can play. Choose the film's own file.".to_string())?;
    if new.size == 0 {
        return Err("That file is empty (0 bytes).".into());
    }
    let (old_path, old_dir, old_kind): (String, String, String) = conn
        .query_row(
            "SELECT m.path, m.parent_dir, r.kind FROM media_files m
               JOIN library_roots r ON r.id = m.root_id WHERE m.id = ?1",
            [file_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|_| "That file is no longer in the library.".to_string())?;
    let roots: Vec<(i64, String, String)> = {
        let mut stmt = conn.prepare("SELECT id, path, kind FROM library_roots").map_err(to_string_err)?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).map_err(to_string_err)?;
        rows.collect::<rusqlite::Result<_>>().map_err(to_string_err)?
    };
    let wanted = comparable(&new.path);
    let (root_id, _, kind) = roots
        .into_iter()
        .find(|(_, path, _)| is_within(&wanted, &comparable(path)))
        .ok_or_else(|| {
            "That file is not in one of your library folders. Add its folder to the library first, \
             then play the film again."
                .to_string()
        })?;
    if (kind == crate::videos::KIND) != (old_kind == crate::videos::KIND) {
        return Err("That file is in a Videos folder, and this one is a film or an episode (or the \
                    other way round). Choose a file in a folder of the same kind."
            .into());
    }
    let tx = conn.transaction().map_err(to_string_err)?;
    tx.execute("DELETE FROM media_files WHERE path = ?1 AND id <> ?2", params![new.path, file_id])
        .map_err(to_string_err)?;
    tx.execute(
        "UPDATE media_files
            SET root_id = ?2, path = ?3, parent_dir = ?4, file_name = ?5, extension = ?6,
                size_bytes = ?7, modified_at = ?8, last_seen_at = ?9, missing = 0
          WHERE id = ?1",
        params![
            file_id,
            root_id,
            new.path,
            new.parent_dir,
            new.file_name,
            new.extension,
            new.size,
            new.modified,
            now_secs()
        ],
    )
    .map_err(to_string_err)?;
    crate::following::carry_paths(&tx, file_id, &old_path, &new.path, &old_dir, &new.parent_dir)
        .map_err(to_string_err)?;
    tx.commit().map_err(to_string_err)?;
    crate::log!("missing file: row {file_id} relinked to the file found or picked");
    Ok(())
}

/// Take a file that is not there out of the library, as the next scan would:
/// marked missing, its history kept in case it comes back.
pub fn remove(conn: &Connection, file_id: i64) -> Result<(), String> {
    let path: String = conn
        .query_row("SELECT path FROM media_files WHERE id = ?1", [file_id], |r| r.get(0))
        .map_err(|_| "That file is no longer in the library.".to_string())?;
    if Path::new(&path).is_file() {
        return Err("The file is there after all. Play it again.".into());
    }
    conn.execute("UPDATE media_files SET missing = 1 WHERE id = ?1", [file_id]).map_err(to_string_err)?;
    crate::log!("missing file: row {file_id} removed from the library");
    Ok(())
}

#[tauri::command]
pub async fn locate_file(app: tauri::AppHandle, file_id: i64) -> Result<Whereabouts, String> {
    let facts = {
        let db = app.state::<Db>();
        let conn = db.0.lock().map_err(to_string_err)?;
        facts(&conn, file_id)?
    };
    tauri::async_runtime::spawn_blocking(move || locate(&facts)).await.map_err(to_string_err)
}

#[tauri::command]
pub fn relink_file(db: tauri::State<Db>, file_id: i64, path: String) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(to_string_err)?;
    relink(&mut conn, file_id, &path)
}

#[tauri::command]
pub fn remove_missing_file(db: tauri::State<Db>, file_id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(to_string_err)?;
    remove(&conn, file_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    struct Lib {
        conn: Connection,
        dir: PathBuf,
    }

    impl Lib {
        /// Library folders `Films` (movies), `More` (movies) and `Clips`
        /// (videos), the files given, each as many bytes long as its number,
        /// then a scan.
        fn new(name: &str, files: &[(&str, usize)]) -> Lib {
            let dir = std::env::temp_dir().join(format!("kinema-missing-{name}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            for root in ["Films", "More", "Clips"] {
                std::fs::create_dir_all(dir.join(root)).unwrap();
            }
            let lib = Lib { conn: crate::db::open(&dir.join("library.db")).unwrap(), dir };
            for (file, size) in files {
                lib.write(file, *size);
            }
            lib.conn
                .execute(
                    "INSERT INTO library_roots (id, path, kind, added_at) VALUES
                       (1, ?1, 'movies', 0), (2, ?2, 'movies', 0), (3, ?3, 'videos', 0)",
                    params![lib.path("Films"), lib.path("More"), lib.path("Clips")],
                )
                .unwrap();
            let mut lib = lib;
            crate::scanner::scan_all(&mut lib.conn).unwrap();
            lib
        }
        /// As the scan writes it: this system's separators.
        fn path(&self, file: &str) -> String {
            let mut path = self.dir.clone();
            path.extend(file.split('/'));
            path.to_string_lossy().into_owned()
        }
        fn write(&self, file: &str, size: usize) {
            let path = self.dir.join(file);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, vec![b'x'; size]).unwrap();
        }
        fn mv(&self, from: &str, to: &str) {
            let to_path = self.dir.join(to);
            std::fs::create_dir_all(to_path.parent().unwrap()).unwrap();
            std::fs::rename(self.dir.join(from), to_path).unwrap();
        }
        fn id(&self, file: &str) -> i64 {
            self.conn
                .query_row("SELECT id FROM media_files WHERE path = ?1", [self.path(file)], |r| r.get(0))
                .unwrap()
        }
        fn locate(&self, id: i64) -> Whereabouts {
            locate(&facts(&self.conn, id).unwrap())
        }
    }

    impl Drop for Lib {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    #[test]
    fn a_file_moved_to_another_library_folder_is_found_by_name_and_size() {
        let lib = Lib::new("moved", &[("Films/A Film (2001).mkv", 11), ("Films/Other.mkv", 12)]);
        let id = lib.id("Films/A Film (2001).mkv");
        assert_eq!(lib.locate(id), Whereabouts::Here);
        lib.mv("Films/A Film (2001).mkv", "More/Sorted/A Film (2001).mkv");
        assert_eq!(
            lib.locate(id),
            Whereabouts::Moved {
                path: lib.path("More/Sorted/A Film (2001).mkv"),
                folder: lib.path("More/Sorted"),
            }
        );
    }

    #[test]
    fn a_name_alone_or_a_size_alone_is_never_the_same_file() {
        let lib = Lib::new("name-only", &[("Films/A Film (2001).mkv", 11), ("Films/Keep.mkv", 3)]);
        let id = lib.id("Films/A Film (2001).mkv");
        std::fs::remove_file(lib.dir.join("Films/A Film (2001).mkv")).unwrap();
        lib.write("More/A Film (2001).mkv", 12); // same name, another size
        lib.write("More/Something else.mkv", 11); // same size, another name
        assert_eq!(lib.locate(id), Whereabouts::NotFound);
    }

    #[test]
    fn two_candidates_and_none_is_picked() {
        let lib = Lib::new("several", &[("Films/A Film (2001).mkv", 11), ("Films/Keep.mkv", 3)]);
        let id = lib.id("Films/A Film (2001).mkv");
        lib.mv("Films/A Film (2001).mkv", "More/x/A Film (2001).mkv");
        lib.write("More/y/A Film (2001).mkv", 11);
        assert_eq!(lib.locate(id), Whereabouts::Several { count: 2 });
    }

    #[test]
    fn a_library_folder_out_of_reach_is_offline_not_gone() {
        let lib = Lib::new("offline", &[("Films/A Film (2001).mkv", 11)]);
        let id = lib.id("Films/A Film (2001).mkv");
        // An empty mount point: the folder is there, with nothing in it.
        std::fs::remove_file(lib.dir.join("Films/A Film (2001).mkv")).unwrap();
        assert_eq!(lib.locate(id), Whereabouts::Offline { place: lib.path("Films") });
        // The folder itself gone, as a drive letter that is not there.
        std::fs::remove_dir_all(lib.dir.join("Films")).unwrap();
        assert_eq!(lib.locate(id), Whereabouts::Offline { place: lib.path("Films") });
    }

    #[test]
    fn relinking_keeps_what_was_watched_and_decided() {
        let mut lib = Lib::new("relink", &[("Films/A Film (2001).mkv", 11), ("Films/Keep.mkv", 3)]);
        let id = lib.id("Films/A Film (2001).mkv");
        lib.conn
            .execute_batch(&format!(
                "INSERT INTO titles (id, kind, provider, provider_id, title, fetched_at)
                     VALUES (7, 'movie', 'tmdb', '1', 'A Film', 0);
                 UPDATE media_files SET title_id = 7, match_status = 'matched',
                        match_reason = 'manual: picked' WHERE id = {id};
                 INSERT INTO playback_state (file_id, position_secs, duration_secs, completed, updated_at)
                     VALUES ({id}, 1234, 6000, 0, 0);"
            ))
            .unwrap();
        lib.mv("Films/A Film (2001).mkv", "More/A Film (2001).mkv");
        // A scan meanwhile made its own row for the new place; it goes.
        lib.conn
            .execute(
                "INSERT INTO media_files (root_id, path, parent_dir, file_name, extension, size_bytes,
                     modified_at, first_seen_at, last_seen_at)
                 VALUES (2, ?1, ?2, 'A Film (2001).mkv', 'mkv', 11, 0, 0, 0)",
                params![lib.path("More/A Film (2001).mkv"), lib.path("More")],
            )
            .unwrap();
        let new_path = lib.path("More/A Film (2001).mkv");
        relink(&mut lib.conn, id, &new_path).unwrap();
        let (path, root, title, missing): (String, i64, i64, i64) = lib
            .conn
            .query_row(
                "SELECT path, root_id, title_id, missing FROM media_files WHERE id = ?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!((path, root, title, missing), (lib.path("More/A Film (2001).mkv"), 2, 7, 0));
        let position: f64 = lib
            .conn
            .query_row("SELECT position_secs FROM playback_state WHERE file_id = ?1", [id], |r| r.get(0))
            .unwrap();
        assert_eq!(position, 1234.0);
        let rows: i64 = lib
            .conn
            .query_row("SELECT COUNT(*) FROM media_files WHERE path = ?1", [lib.path("More/A Film (2001).mkv")], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(rows, 1, "one row for the file, the old one");
    }

    #[test]
    fn a_picked_file_must_be_a_video_in_a_library_folder_of_the_same_kind() {
        let mut lib = Lib::new("refuse", &[("Films/A Film (2001).mkv", 11), ("Films/Keep.mkv", 3)]);
        let id = lib.id("Films/A Film (2001).mkv");
        lib.write("More/notes.txt", 11);
        lib.write("Elsewhere/A Film (2001).mkv", 11);
        lib.write("Clips/A Film (2001).mkv", 11);
        for wrong in ["More/notes.txt", "Elsewhere/A Film (2001).mkv", "Clips/A Film (2001).mkv", "More/none.mkv"] {
            let path = lib.path(wrong);
            assert!(relink(&mut lib.conn, id, &path).is_err(), "{wrong} refused");
        }
        let path: String =
            lib.conn.query_row("SELECT path FROM media_files WHERE id = ?1", [id], |r| r.get(0)).unwrap();
        assert_eq!(path, lib.path("Films/A Film (2001).mkv"), "nothing changed");
    }

    #[test]
    fn remove_takes_out_only_a_file_that_is_not_there() {
        let lib = Lib::new("remove", &[("Films/A Film (2001).mkv", 11), ("Films/Keep.mkv", 3)]);
        let id = lib.id("Films/A Film (2001).mkv");
        assert!(remove(&lib.conn, id).is_err(), "the file is there");
        std::fs::remove_file(lib.dir.join("Films/A Film (2001).mkv")).unwrap();
        remove(&lib.conn, id).unwrap();
        let missing: i64 =
            lib.conn.query_row("SELECT missing FROM media_files WHERE id = ?1", [id], |r| r.get(0)).unwrap();
        assert_eq!(missing, 1);
    }
}
