/**
 * A file that is not there when Play is pressed (missing_file.rs): where it
 * might be, and the two things that can be done about it. The page side is
 * MissingFile.tsx.
 */
import { invoke } from '@tauri-apps/api/core';

/** What a look at the disk found (missing_file.rs `Whereabouts`). */
export type Whereabouts =
  | { state: 'here' }
  /** The one file of the same name and size elsewhere in the library folders. */
  | { state: 'moved'; path: string; folder: string }
  /** The drive or share of its library folder cannot be reached: not deleted. */
  | { state: 'offline'; place: string }
  /** More than one file of its name and size: none is picked. */
  | { state: 'several'; count: number }
  | { state: 'not_found' };

export const locateFile = (fileId: number) => invoke<Whereabouts>('locate_file', { fileId });
/** The file is now at `path`; its watched state and choices go with it. */
export const relinkFile = (fileId: number, path: string) =>
  invoke<void>('relink_file', { fileId, path });
/** Out of the library, as the next scan would take it; back if the file comes back. */
export const removeMissingFile = (fileId: number) => invoke<void>('remove_missing_file', { fileId });
