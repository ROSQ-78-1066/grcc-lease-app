import fs from "node:fs/promises";
import nodePath from "node:path";
import { config } from "../config";
import { FileEntry, Listing, Storage, StorageError } from "./types";

/**
 * Demo storage: maps the Egnyte root folder onto ./demo-data/Leasing App so the
 * whole workflow can be tried locally without Egnyte credentials.
 */
export class LocalStorage implements Storage {
  kind = "local" as const;
  private baseDir = nodePath.resolve(process.cwd(), "demo-data", "Leasing App");

  private abs(path: string): string {
    const root = config.folders.root;
    let rel = path.startsWith(root) ? path.slice(root.length) : path;
    rel = rel.replace(/^\/+/, "");
    const p = nodePath.resolve(this.baseDir, rel);
    if (!p.startsWith(this.baseDir)) throw new StorageError("Path outside demo folder", 400);
    return p;
  }

  async list(path: string): Promise<Listing> {
    const dir = this.abs(path);
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      throw new StorageError(`Folder not found: ${path}`, 404);
    }
    const out: Listing = { folders: [], files: [] };
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const p = `${path.replace(/\/$/, "")}/${e.name}`;
      if (e.isDirectory()) out.folders.push({ name: e.name, path: p });
      else {
        const st = await fs.stat(nodePath.join(dir, e.name));
        out.files.push({ name: e.name, path: p, size: st.size, modified: st.mtime.toISOString() });
      }
    }
    return out;
  }

  async listFiles(path: string, depth = 2): Promise<FileEntry[]> {
    const l = await this.list(path);
    let out = [...l.files];
    if (depth > 0)
      for (const f of l.folders) if (!f.name.startsWith("_")) out = out.concat(await this.listFiles(f.path, depth - 1));
    return out;
  }

  async download(path: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.abs(path));
    } catch {
      throw new StorageError(`File not found: ${path}`, 404);
    }
  }

  async upload(path: string, data: Buffer): Promise<FileEntry> {
    const p = this.abs(path);
    await fs.mkdir(nodePath.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
    return { name: nodePath.basename(p), path, size: data.length };
  }

  async copy(from: string, to: string): Promise<void> {
    const t = this.abs(to);
    await fs.mkdir(nodePath.dirname(t), { recursive: true });
    await fs.copyFile(this.abs(from), t);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(this.abs(path));
      return true;
    } catch {
      return false;
    }
  }

  async ensureFolder(path: string): Promise<void> {
    await fs.mkdir(this.abs(path), { recursive: true });
  }

  async remove(path: string): Promise<void> {
    await fs.rm(this.abs(path), { force: true });
  }

  async webLink(): Promise<string | null> {
    return null; // no Egnyte web UI in demo mode
  }
}
