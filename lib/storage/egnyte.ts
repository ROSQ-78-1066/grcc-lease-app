import { config } from "../config";
import { FileEntry, Listing, Storage, StorageError } from "./types";

// Egnyte Public API: https://developers.egnyte.com/docs
// File system:  GET/POST /pubapi/v1/fs/{path}
// Content:      GET/POST /pubapi/v1/fs-content/{path}

const base = () => `https://${config.egnyte.domain}.egnyte.com`;

function encPath(path: string): string {
  return path
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class EgnyteStorage implements Storage {
  kind = "egnyte" as const;
  constructor(private token: string) {}

  private async req(url: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, ...(init.headers || {}) },
      cache: "no-store",
    });
    // Egnyte throttles per-key QPS with 403 "Developer Over Qps" or 429.
    if ((res.status === 429 || (res.status === 403 && /over qps/i.test(res.headers.get("x-mashery-error-code") || ""))) && attempt < 4) {
      const wait = Number(res.headers.get("retry-after") || 1) * 1000;
      await sleep(Math.max(wait, 600 * (attempt + 1)));
      return this.req(url, init, attempt + 1);
    }
    return res;
  }

  private async fail(res: Response, what: string): Promise<never> {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {}
    if (res.status === 401) throw new StorageError("Your Egnyte session expired. Please sign in again.", 401);
    throw new StorageError(`Egnyte ${what} failed (${res.status}). ${detail}`, res.status === 404 ? 404 : 502);
  }

  async list(path: string): Promise<Listing> {
    const res = await this.req(`${base()}/pubapi/v1/fs${encPath(path)}?list_content=true`);
    if (!res.ok) return this.fail(res, `listing ${path}`);
    const j = (await res.json()) as {
      folders?: { name: string; path: string; folder_id?: string }[];
      files?: { name: string; path: string; size?: number; last_modified?: string; group_id?: string }[];
    };
    return {
      folders: (j.folders || []).map((f) => ({ name: f.name, path: f.path, folderId: f.folder_id })),
      files: (j.files || []).map((f) => ({
        name: f.name,
        path: f.path,
        size: f.size,
        modified: f.last_modified,
        groupId: f.group_id,
      })),
    };
  }

  async listFiles(path: string, depth = 2): Promise<FileEntry[]> {
    const l = await this.list(path);
    let out = [...l.files];
    if (depth > 0) {
      for (const f of l.folders) {
        if (f.name.startsWith("_")) continue;
        try {
          out = out.concat(await this.listFiles(f.path, depth - 1));
        } catch {}
      }
    }
    return out;
  }

  async download(path: string): Promise<Buffer> {
    const res = await this.req(`${base()}/pubapi/v1/fs-content${encPath(path)}`);
    if (!res.ok) return this.fail(res, `download of ${path}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async upload(path: string, data: Buffer): Promise<FileEntry> {
    const res = await this.req(`${base()}/pubapi/v1/fs-content${encPath(path)}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(data),
    });
    if (!res.ok) return this.fail(res, `upload to ${path}`);
    const j = (await res.json().catch(() => ({}))) as { group_id?: string };
    return { name: path.split("/").pop()!, path, size: data.length, groupId: j.group_id };
  }

  async copy(from: string, to: string): Promise<void> {
    const res = await this.req(`${base()}/pubapi/v1/fs${encPath(from)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "copy", destination: to }),
    });
    if (!res.ok) return this.fail(res, `copy of ${from}`);
  }

  async exists(path: string): Promise<boolean> {
    const res = await this.req(`${base()}/pubapi/v1/fs${encPath(path)}`);
    return res.ok;
  }

  async ensureFolder(path: string): Promise<void> {
    if (await this.exists(path)) return;
    const res = await this.req(`${base()}/pubapi/v1/fs${encPath(path)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_folder" }),
    });
    if (!res.ok && res.status !== 403 && res.status !== 409) return this.fail(res, `creating folder ${path}`);
  }

  async webLink(path: string, entry?: FileEntry): Promise<string | null> {
    let groupId = entry?.groupId;
    let folderId: string | undefined;
    if (!groupId) {
      const res = await this.req(`${base()}/pubapi/v1/fs${encPath(path)}`);
      if (res.ok) {
        const j = (await res.json()) as { group_id?: string; folder_id?: string; is_folder?: boolean };
        groupId = j.is_folder ? undefined : j.group_id;
        folderId = j.folder_id;
      }
    }
    if (groupId) return `${base()}/navigate/file/${groupId}`;
    if (folderId) return `${base()}/navigate/folder/${folderId}`;
    // Fallback: path-based link into the web UI
    return `${base()}/app/index.do#storage/files/1${encPath(path)}`;
  }
}

/** Egnyte user info for the signed-in token. */
export async function egnyteUserInfo(token: string) {
  const res = await fetch(`${base()}/pubapi/v1/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new StorageError(`Could not read Egnyte user info (${res.status})`, 401);
  const u = (await res.json()) as { id?: number; username: string; first_name?: string; last_name?: string; email?: string };
  let email = u.email || "";
  if (!email && u.id) {
    try {
      const r2 = await fetch(`${base()}/pubapi/v2/users/${u.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r2.ok) {
        const j = (await r2.json()) as { email?: string };
        email = j.email || "";
      }
    } catch {}
  }
  return { username: u.username, firstName: u.first_name || "", lastName: u.last_name || "", email };
}
