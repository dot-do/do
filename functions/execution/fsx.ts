/**
 * Filesystem Abstraction (fsx)
 *
 * Provides a unified filesystem interface that can be backed by
 * different storage backends: in-memory, R2, KV, or SQLite.
 * Implements a Node.js-compatible filesystem API.
 *
 * @module execution/fsx
 */

import type {
  FileSystem,
  BufferEncodingType,
  MkdirOptions,
  RmdirOptions,
  ReaddirOptions,
  Dirent,
  Stats,
} from '../../types/execution'

/**
 * Supported filesystem backends
 */
export type FileSystemBackend = 'memory' | 'r2' | 'kv' | 'sqlite'

/**
 * Create a filesystem instance with the specified backend.
 *
 * @param backend - Backend type ('memory', 'r2', 'kv', 'sqlite')
 * @param options - Backend-specific options
 * @returns FileSystem instance
 *
 * @example
 * ```typescript
 * const fs = createFileSystem('memory')
 * await fs.writeFile('/data.json', '{"key": "value"}')
 * const content = await fs.readFile('/data.json', 'utf-8')
 * ```
 */
export function createFileSystem(
  backend: FileSystemBackend = 'memory',
  options: FileSystemOptions = {}
): FileSystem {
  switch (backend) {
    case 'memory':
      return new MemoryFileSystem()
    case 'r2':
      return new R2FileSystem(options.r2Bucket)
    case 'kv':
      return new KVFileSystem(options.kvNamespace)
    case 'sqlite':
      return new SQLiteFileSystem(options.sqliteDb)
    default:
      throw new Error(`Unknown filesystem backend: ${backend}`)
  }
}

/**
 * Filesystem creation options
 */
export interface FileSystemOptions {
  /** R2 bucket binding for R2 backend */
  r2Bucket?: R2Bucket
  /** KV namespace binding for KV backend */
  kvNamespace?: KVNamespace
  /** D1 database binding for SQLite backend */
  sqliteDb?: D1Database
}

// =============================================================================
// Memory Filesystem Implementation
// =============================================================================

/**
 * In-memory filesystem implementation.
 * Useful for testing and ephemeral operations.
 */
export class MemoryFileSystem implements FileSystem {
  private files: Map<string, Uint8Array> = new Map()
  private directories: Set<string> = new Set(['/'])
  private metadata: Map<string, FileMetadata> = new Map()

  async readFile(path: string, encoding?: BufferEncodingType): Promise<string | Uint8Array> {
    const normalizedPath = this.normalizePath(path)
    const data = this.files.get(normalizedPath)

    if (!data) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`)
    }

    if (encoding === 'utf-8' || encoding === 'utf8') {
      return new TextDecoder().decode(data)
    }

    if (encoding === 'base64') {
      return btoa(String.fromCharCode(...data))
    }

    if (encoding === 'hex') {
      return Array.from(data)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    }

    return data
  }

  async writeFile(path: string, data: string | Uint8Array): Promise<void> {
    const normalizedPath = this.normalizePath(path)
    const dir = this.dirname(normalizedPath)

    if (!this.directories.has(dir)) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`)
    }

    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    this.files.set(normalizedPath, bytes)

    const now = Date.now()
    this.metadata.set(normalizedPath, {
      size: bytes.length,
      createdAt: this.metadata.get(normalizedPath)?.createdAt ?? now,
      modifiedAt: now,
      accessedAt: now,
      mode: 0o644,
      isFile: true,
      isDirectory: false,
      isSymlink: false,
    })
  }

  async appendFile(path: string, data: string | Uint8Array): Promise<void> {
    const normalizedPath = this.normalizePath(path)
    const existing = this.files.get(normalizedPath) ?? new Uint8Array(0)
    const newData = typeof data === 'string' ? new TextEncoder().encode(data) : data

    const combined = new Uint8Array(existing.length + newData.length)
    combined.set(existing, 0)
    combined.set(newData, existing.length)

    await this.writeFile(path, combined)
  }

  async mkdir(path: string, options?: MkdirOptions): Promise<void> {
    const normalizedPath = this.normalizePath(path)

    if (this.directories.has(normalizedPath)) {
      if (!options?.recursive) {
        throw new Error(`EEXIST: file already exists, mkdir '${path}'`)
      }
      return
    }

    const parent = this.dirname(normalizedPath)
    if (!this.directories.has(parent)) {
      if (options?.recursive) {
        await this.mkdir(parent, options)
      } else {
        throw new Error(`ENOENT: no such file or directory, mkdir '${path}'`)
      }
    }

    this.directories.add(normalizedPath)

    const now = Date.now()
    this.metadata.set(normalizedPath, {
      size: 0,
      createdAt: now,
      modifiedAt: now,
      accessedAt: now,
      mode: options?.mode ?? 0o755,
      isFile: false,
      isDirectory: true,
      isSymlink: false,
    })
  }

  async rmdir(path: string, options?: RmdirOptions): Promise<void> {
    const normalizedPath = this.normalizePath(path)

    if (!this.directories.has(normalizedPath)) {
      throw new Error(`ENOENT: no such file or directory, rmdir '${path}'`)
    }

    // Check if directory is empty
    const contents = await this.readdir(path)
    if (contents.length > 0) {
      if (options?.recursive) {
        for (const item of contents) {
          const itemPath = `${normalizedPath}/${item}`
          if (this.directories.has(itemPath)) {
            await this.rmdir(itemPath, options)
          } else {
            await this.unlink(itemPath)
          }
        }
      } else {
        throw new Error(`ENOTEMPTY: directory not empty, rmdir '${path}'`)
      }
    }

    this.directories.delete(normalizedPath)
    this.metadata.delete(normalizedPath)
  }

  async readdir(path: string, options?: ReaddirOptions): Promise<Dirent[] | string[]> {
    const normalizedPath = this.normalizePath(path)

    if (!this.directories.has(normalizedPath)) {
      throw new Error(`ENOENT: no such file or directory, scandir '${path}'`)
    }

    const prefix = normalizedPath === '/' ? '/' : `${normalizedPath}/`
    const entries: string[] = []

    // Collect files
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(prefix)) {
        const rest = filePath.slice(prefix.length)
        const name = rest.split('/')[0]
        if (name && !entries.includes(name)) {
          entries.push(name)
        }
      }
    }

    // Collect directories
    for (const dirPath of this.directories) {
      if (dirPath.startsWith(prefix) && dirPath !== normalizedPath) {
        const rest = dirPath.slice(prefix.length)
        const name = rest.split('/')[0]
        if (name && !entries.includes(name)) {
          entries.push(name)
        }
      }
    }

    if (options?.withFileTypes) {
      return entries.map((name) => this.createDirent(name, `${prefix}${name}`))
    }

    return entries
  }

  async stat(path: string): Promise<Stats> {
    const normalizedPath = this.normalizePath(path)
    const meta = this.metadata.get(normalizedPath)

    if (!meta) {
      throw new Error(`ENOENT: no such file or directory, stat '${path}'`)
    }

    return this.createStats(meta)
  }

  async lstat(path: string): Promise<Stats> {
    // For memory filesystem, lstat is same as stat (no symlinks)
    return this.stat(path)
  }

  async unlink(path: string): Promise<void> {
    const normalizedPath = this.normalizePath(path)

    if (!this.files.has(normalizedPath)) {
      throw new Error(`ENOENT: no such file or directory, unlink '${path}'`)
    }

    this.files.delete(normalizedPath)
    this.metadata.delete(normalizedPath)
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const normalizedOld = this.normalizePath(oldPath)
    const normalizedNew = this.normalizePath(newPath)

    const data = this.files.get(normalizedOld)
    if (!data) {
      throw new Error(`ENOENT: no such file or directory, rename '${oldPath}'`)
    }

    const meta = this.metadata.get(normalizedOld)
    this.files.set(normalizedNew, data)
    if (meta) {
      this.metadata.set(normalizedNew, meta)
    }

    this.files.delete(normalizedOld)
    this.metadata.delete(normalizedOld)
  }

  async copyFile(src: string, dest: string): Promise<void> {
    const data = await this.readFile(src)
    await this.writeFile(dest, data)
  }

  async exists(path: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(path)
    return this.files.has(normalizedPath) || this.directories.has(normalizedPath)
  }

  async realpath(path: string): Promise<string> {
    const normalizedPath = this.normalizePath(path)
    if (!(await this.exists(path))) {
      throw new Error(`ENOENT: no such file or directory, realpath '${path}'`)
    }
    return normalizedPath
  }

  async symlink(_target: string, _path: string): Promise<void> {
    throw new Error('Symlinks not supported in memory filesystem')
  }

  async readlink(_path: string): Promise<string> {
    throw new Error('Symlinks not supported in memory filesystem')
  }

  async chmod(path: string, mode: number): Promise<void> {
    const normalizedPath = this.normalizePath(path)
    const meta = this.metadata.get(normalizedPath)

    if (!meta) {
      throw new Error(`ENOENT: no such file or directory, chmod '${path}'`)
    }

    meta.mode = mode
  }

  async chown(_path: string, _uid: number, _gid: number): Promise<void> {
    // No-op for memory filesystem
  }

  async truncate(path: string, len = 0): Promise<void> {
    const normalizedPath = this.normalizePath(path)
    const data = this.files.get(normalizedPath)

    if (!data) {
      throw new Error(`ENOENT: no such file or directory, truncate '${path}'`)
    }

    this.files.set(normalizedPath, data.slice(0, len))
  }

  async utimes(path: string, atime: Date | number, mtime: Date | number): Promise<void> {
    const normalizedPath = this.normalizePath(path)
    const meta = this.metadata.get(normalizedPath)

    if (!meta) {
      throw new Error(`ENOENT: no such file or directory, utimes '${path}'`)
    }

    meta.accessedAt = typeof atime === 'number' ? atime : atime.getTime()
    meta.modifiedAt = typeof mtime === 'number' ? mtime : mtime.getTime()
  }

  // Helper methods

  private normalizePath(path: string): string {
    // Remove trailing slash, handle relative paths
    let normalized = path.replace(/\/+$/, '') || '/'
    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized
    }
    return normalized
  }

  private dirname(path: string): string {
    const parts = path.split('/')
    parts.pop()
    return parts.join('/') || '/'
  }

  private createDirent(name: string, path: string): Dirent {
    const meta = this.metadata.get(path)
    const isDir = this.directories.has(path)

    return {
      name,
      isFile: () => meta?.isFile ?? !isDir,
      isDirectory: () => meta?.isDirectory ?? isDir,
      isSymbolicLink: () => meta?.isSymlink ?? false,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isFIFO: () => false,
      isSocket: () => false,
    }
  }

  private createStats(meta: FileMetadata): Stats {
    return {
      dev: 0,
      ino: 0,
      mode: meta.mode,
      nlink: 1,
      uid: 0,
      gid: 0,
      rdev: 0,
      size: meta.size,
      blksize: 4096,
      blocks: Math.ceil(meta.size / 512),
      atimeMs: meta.accessedAt,
      mtimeMs: meta.modifiedAt,
      ctimeMs: meta.modifiedAt,
      birthtimeMs: meta.createdAt,
      atime: new Date(meta.accessedAt),
      mtime: new Date(meta.modifiedAt),
      ctime: new Date(meta.modifiedAt),
      birthtime: new Date(meta.createdAt),
      isFile: () => meta.isFile,
      isDirectory: () => meta.isDirectory,
      isSymbolicLink: () => meta.isSymlink,
    }
  }
}

/**
 * File metadata
 */
interface FileMetadata {
  size: number
  createdAt: number
  modifiedAt: number
  accessedAt: number
  mode: number
  isFile: boolean
  isDirectory: boolean
  isSymlink: boolean
}

// =============================================================================
// R2 Filesystem Implementation (Stub)
// =============================================================================

/**
 * R2-backed filesystem implementation.
 * Uses Cloudflare R2 object storage as the backend.
 */
export class R2FileSystem implements FileSystem {
  constructor(private bucket?: R2Bucket) {}

  async readFile(path: string, encoding?: BufferEncodingType): Promise<string | Uint8Array> {
    if (!this.bucket) {
      throw new Error('R2 bucket not configured')
    }

    const object = await this.bucket.get(path)
    if (!object) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`)
    }

    const data = await object.arrayBuffer()

    if (encoding === 'utf-8' || encoding === 'utf8') {
      return new TextDecoder().decode(data)
    }

    return new Uint8Array(data)
  }

  async writeFile(path: string, data: string | Uint8Array): Promise<void> {
    if (!this.bucket) {
      throw new Error('R2 bucket not configured')
    }

    await this.bucket.put(path, data)
  }

  async appendFile(_path: string, _data: string | Uint8Array): Promise<void> {
    throw new Error('Append not supported in R2 filesystem')
  }

  async mkdir(_path: string, _options?: MkdirOptions): Promise<void> {
    // R2 doesn't need explicit directory creation
  }

  async rmdir(_path: string, _options?: RmdirOptions): Promise<void> {
    // R2 doesn't have directories
  }

  async readdir(path: string, _options?: ReaddirOptions): Promise<string[]> {
    if (!this.bucket) {
      throw new Error('R2 bucket not configured')
    }

    const prefix = path.endsWith('/') ? path : `${path}/`
    const list = await this.bucket.list({ prefix })

    return list.objects.map((obj) => obj.key.slice(prefix.length).split('/')[0])
  }

  async stat(path: string): Promise<Stats> {
    if (!this.bucket) {
      throw new Error('R2 bucket not configured')
    }

    const object = await this.bucket.head(path)
    if (!object) {
      throw new Error(`ENOENT: no such file or directory, stat '${path}'`)
    }

    const now = Date.now()
    return {
      dev: 0,
      ino: 0,
      mode: 0o644,
      nlink: 1,
      uid: 0,
      gid: 0,
      rdev: 0,
      size: object.size,
      blksize: 4096,
      blocks: Math.ceil(object.size / 512),
      atimeMs: now,
      mtimeMs: object.uploaded.getTime(),
      ctimeMs: object.uploaded.getTime(),
      birthtimeMs: object.uploaded.getTime(),
      atime: new Date(now),
      mtime: object.uploaded,
      ctime: object.uploaded,
      birthtime: object.uploaded,
      isFile: () => true,
      isDirectory: () => false,
      isSymbolicLink: () => false,
    }
  }

  async lstat(path: string): Promise<Stats> {
    return this.stat(path)
  }

  async unlink(path: string): Promise<void> {
    if (!this.bucket) {
      throw new Error('R2 bucket not configured')
    }

    await this.bucket.delete(path)
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const data = await this.readFile(oldPath)
    await this.writeFile(newPath, data)
    await this.unlink(oldPath)
  }

  async copyFile(src: string, dest: string): Promise<void> {
    const data = await this.readFile(src)
    await this.writeFile(dest, data)
  }

  async exists(path: string): Promise<boolean> {
    if (!this.bucket) {
      return false
    }

    const object = await this.bucket.head(path)
    return object !== null
  }

  async realpath(path: string): Promise<string> {
    return path
  }

  async symlink(_target: string, _path: string): Promise<void> {
    throw new Error('Symlinks not supported in R2 filesystem')
  }

  async readlink(_path: string): Promise<string> {
    throw new Error('Symlinks not supported in R2 filesystem')
  }

  async chmod(_path: string, _mode: number): Promise<void> {
    // No-op for R2
  }

  async chown(_path: string, _uid: number, _gid: number): Promise<void> {
    // No-op for R2
  }

  async truncate(_path: string, _len?: number): Promise<void> {
    throw new Error('Truncate not supported in R2 filesystem')
  }

  async utimes(_path: string, _atime: Date | number, _mtime: Date | number): Promise<void> {
    // No-op for R2
  }
}

// =============================================================================
// KV Filesystem Implementation (Stub)
// =============================================================================

/**
 * KV-backed filesystem implementation.
 * Uses Cloudflare KV for small files (< 25MB).
 */
export class KVFileSystem implements FileSystem {
  constructor(private kv?: KVNamespace) {}

  async readFile(path: string, encoding?: BufferEncodingType): Promise<string | Uint8Array> {
    if (!this.kv) {
      throw new Error('KV namespace not configured')
    }

    const data = await this.kv.get(path, 'arrayBuffer')
    if (!data) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`)
    }

    if (encoding === 'utf-8' || encoding === 'utf8') {
      return new TextDecoder().decode(data)
    }

    return new Uint8Array(data)
  }

  async writeFile(path: string, data: string | Uint8Array): Promise<void> {
    if (!this.kv) {
      throw new Error('KV namespace not configured')
    }

    await this.kv.put(path, data)
  }

  async appendFile(_path: string, _data: string | Uint8Array): Promise<void> {
    throw new Error('Append not supported in KV filesystem')
  }

  async mkdir(_path: string, _options?: MkdirOptions): Promise<void> {
    // KV doesn't need explicit directory creation
  }

  async rmdir(_path: string, _options?: RmdirOptions): Promise<void> {
    // KV doesn't have directories
  }

  async readdir(path: string, _options?: ReaddirOptions): Promise<string[]> {
    if (!this.kv) {
      throw new Error('KV namespace not configured')
    }

    const prefix = path.endsWith('/') ? path : `${path}/`
    const list = await this.kv.list({ prefix })

    return list.keys.map((key) => key.name.slice(prefix.length).split('/')[0])
  }

  async stat(_path: string): Promise<Stats> {
    throw new Error('stat not supported in KV filesystem')
  }

  async lstat(path: string): Promise<Stats> {
    return this.stat(path)
  }

  async unlink(path: string): Promise<void> {
    if (!this.kv) {
      throw new Error('KV namespace not configured')
    }

    await this.kv.delete(path)
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const data = await this.readFile(oldPath)
    await this.writeFile(newPath, data)
    await this.unlink(oldPath)
  }

  async copyFile(src: string, dest: string): Promise<void> {
    const data = await this.readFile(src)
    await this.writeFile(dest, data)
  }

  async exists(path: string): Promise<boolean> {
    if (!this.kv) {
      return false
    }

    const data = await this.kv.get(path)
    return data !== null
  }

  async realpath(path: string): Promise<string> {
    return path
  }

  async symlink(_target: string, _path: string): Promise<void> {
    throw new Error('Symlinks not supported in KV filesystem')
  }

  async readlink(_path: string): Promise<string> {
    throw new Error('Symlinks not supported in KV filesystem')
  }

  async chmod(_path: string, _mode: number): Promise<void> {
    // No-op
  }

  async chown(_path: string, _uid: number, _gid: number): Promise<void> {
    // No-op
  }

  async truncate(_path: string, _len?: number): Promise<void> {
    throw new Error('Truncate not supported in KV filesystem')
  }

  async utimes(_path: string, _atime: Date | number, _mtime: Date | number): Promise<void> {
    // No-op
  }
}

// =============================================================================
// SQLite Filesystem Implementation (Stub)
// =============================================================================

/**
 * SQLite-backed filesystem implementation.
 * Uses Cloudflare D1 database as the storage backend.
 */
export class SQLiteFileSystem implements FileSystem {
  constructor(private db?: D1Database) {}

  async readFile(_path: string, _encoding?: BufferEncodingType): Promise<string | Uint8Array> {
    if (!this.db) {
      throw new Error('D1 database not configured')
    }

    throw new Error('SQLite filesystem not yet implemented')
  }

  async writeFile(_path: string, _data: string | Uint8Array): Promise<void> {
    if (!this.db) {
      throw new Error('D1 database not configured')
    }

    throw new Error('SQLite filesystem not yet implemented')
  }

  async appendFile(_path: string, _data: string | Uint8Array): Promise<void> {
    throw new Error('SQLite filesystem not yet implemented')
  }

  async mkdir(_path: string, _options?: MkdirOptions): Promise<void> {
    throw new Error('SQLite filesystem not yet implemented')
  }

  async rmdir(_path: string, _options?: RmdirOptions): Promise<void> {
    throw new Error('SQLite filesystem not yet implemented')
  }

  async readdir(_path: string, _options?: ReaddirOptions): Promise<string[]> {
    throw new Error('SQLite filesystem not yet implemented')
  }

  async stat(_path: string): Promise<Stats> {
    throw new Error('SQLite filesystem not yet implemented')
  }

  async lstat(path: string): Promise<Stats> {
    return this.stat(path)
  }

  async unlink(_path: string): Promise<void> {
    throw new Error('SQLite filesystem not yet implemented')
  }

  async rename(_oldPath: string, _newPath: string): Promise<void> {
    throw new Error('SQLite filesystem not yet implemented')
  }

  async copyFile(_src: string, _dest: string): Promise<void> {
    throw new Error('SQLite filesystem not yet implemented')
  }

  async exists(_path: string): Promise<boolean> {
    throw new Error('SQLite filesystem not yet implemented')
  }

  async realpath(path: string): Promise<string> {
    return path
  }

  async symlink(_target: string, _path: string): Promise<void> {
    throw new Error('Symlinks not supported in SQLite filesystem')
  }

  async readlink(_path: string): Promise<string> {
    throw new Error('Symlinks not supported in SQLite filesystem')
  }

  async chmod(_path: string, _mode: number): Promise<void> {
    throw new Error('SQLite filesystem not yet implemented')
  }

  async chown(_path: string, _uid: number, _gid: number): Promise<void> {
    throw new Error('SQLite filesystem not yet implemented')
  }

  async truncate(_path: string, _len?: number): Promise<void> {
    throw new Error('SQLite filesystem not yet implemented')
  }

  async utimes(_path: string, _atime: Date | number, _mtime: Date | number): Promise<void> {
    throw new Error('SQLite filesystem not yet implemented')
  }
}
