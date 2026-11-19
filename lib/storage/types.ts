export interface FileEntry {
  name: string;
  /** Full path, e.g. /Shared/Documents/LEASING APP/Draft Leases/x.docx */
  path: string;
  size?: number;
  modified?: string;
  /** Egnyte group_id (stable file id) when available. */
  groupId?: string;
}

export interface FolderEntry {
  name: string;
  path: string;
  folderId?: string;
}

export interface Listing {
  folders: FolderEntry[];
  files: FileEntry[];
}

export interface Storage {
  kind: "egnyte" | "local";
  list(path: string): Promise<Listing>;
  /** Recursive list of files (depth-limited). */
  listFiles(path: string, depth?: number): Promise<FileEntry[]>;
  download(path: string): Promise<Buffer>;
  upload(path: string, data: Buffer): Promise<FileEntry>;
  copy(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  ensureFolder(path: string): Promise<void>;
  /** Delete a file. Egnyte moves it to the Trash, so it can be restored for a while. */
  remove(path: string): Promise<void>;
  /** Link that opens the file (or folder) in the Egnyte web UI. */
  webLink(path: string, entry?: FileEntry): Promise<string | null>;
}

export class StorageError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}
