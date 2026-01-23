/**
 * Tests for Filesystem Abstraction (fsx)
 *
 * @module execution/__tests__/fsx.test
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createFileSystem,
  MemoryFileSystem,
  R2FileSystem,
  KVFileSystem,
  SQLiteFileSystem,
  type FileSystemBackend,
} from './fsx'

describe('Filesystem Abstraction', () => {
  describe('createFileSystem()', () => {
    it('should create memory filesystem by default', () => {
      const fs = createFileSystem()

      expect(fs).toBeInstanceOf(MemoryFileSystem)
    })

    it('should create R2 filesystem', () => {
      const fs = createFileSystem('r2')

      expect(fs).toBeInstanceOf(R2FileSystem)
    })

    it('should create KV filesystem', () => {
      const fs = createFileSystem('kv')

      expect(fs).toBeInstanceOf(KVFileSystem)
    })

    it('should create SQLite filesystem', () => {
      const fs = createFileSystem('sqlite')

      expect(fs).toBeInstanceOf(SQLiteFileSystem)
    })

    it('should throw for unknown backend', () => {
      expect(() => createFileSystem('unknown' as FileSystemBackend)).toThrow()
    })
  })

  describe('MemoryFileSystem', () => {
    let fs: MemoryFileSystem

    beforeEach(() => {
      fs = new MemoryFileSystem()
    })

    describe('writeFile() and readFile()', () => {
      it('should write and read text files', async () => {
        await fs.writeFile('/test.txt', 'Hello, World!')
        const content = await fs.readFile('/test.txt', 'utf-8')

        expect(content).toBe('Hello, World!')
      })

      it('should write and read binary files', async () => {
        const data = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f])
        await fs.writeFile('/binary.bin', data)
        const content = await fs.readFile('/binary.bin')

        expect(content).toEqual(data)
      })

      it('should throw ENOENT for missing files', async () => {
        await expect(fs.readFile('/missing.txt')).rejects.toThrow('ENOENT')
      })

      it('should throw ENOENT when writing to missing directory', async () => {
        await expect(fs.writeFile('/missing/file.txt', 'data')).rejects.toThrow(
          'ENOENT'
        )
      })

      it('should support different encodings', async () => {
        await fs.writeFile('/test.txt', 'hello')

        const base64 = await fs.readFile('/test.txt', 'base64')
        expect(base64).toBe('aGVsbG8=')

        const hex = await fs.readFile('/test.txt', 'hex')
        expect(hex).toBe('68656c6c6f')
      })
    })

    describe('appendFile()', () => {
      it('should append to existing files', async () => {
        await fs.writeFile('/append.txt', 'Hello')
        await fs.appendFile('/append.txt', ' World')
        const content = await fs.readFile('/append.txt', 'utf-8')

        expect(content).toBe('Hello World')
      })

      it('should create file if it does not exist', async () => {
        await fs.appendFile('/new.txt', 'content')
        const content = await fs.readFile('/new.txt', 'utf-8')

        expect(content).toBe('content')
      })
    })

    describe('mkdir()', () => {
      it('should create directories', async () => {
        await fs.mkdir('/mydir')
        const exists = await fs.exists('/mydir')

        expect(exists).toBe(true)
      })

      it('should create nested directories with recursive option', async () => {
        await fs.mkdir('/a/b/c', { recursive: true })

        expect(await fs.exists('/a')).toBe(true)
        expect(await fs.exists('/a/b')).toBe(true)
        expect(await fs.exists('/a/b/c')).toBe(true)
      })

      it('should throw ENOENT without recursive for missing parent', async () => {
        await expect(fs.mkdir('/missing/dir')).rejects.toThrow('ENOENT')
      })

      it('should throw EEXIST for existing directory without recursive', async () => {
        await fs.mkdir('/existing')
        await expect(fs.mkdir('/existing')).rejects.toThrow('EEXIST')
      })

      it('should succeed silently for existing directory with recursive', async () => {
        await fs.mkdir('/existing')
        await fs.mkdir('/existing', { recursive: true })

        expect(await fs.exists('/existing')).toBe(true)
      })
    })

    describe('rmdir()', () => {
      it('should remove empty directories', async () => {
        await fs.mkdir('/empty')
        await fs.rmdir('/empty')

        expect(await fs.exists('/empty')).toBe(false)
      })

      it('should throw ENOTEMPTY for non-empty directories', async () => {
        await fs.mkdir('/nonempty')
        await fs.writeFile('/nonempty/file.txt', 'content')

        await expect(fs.rmdir('/nonempty')).rejects.toThrow('ENOTEMPTY')
      })

      it('should remove non-empty directories with recursive option', async () => {
        await fs.mkdir('/nonempty')
        await fs.writeFile('/nonempty/file.txt', 'content')
        await fs.rmdir('/nonempty', { recursive: true })

        expect(await fs.exists('/nonempty')).toBe(false)
      })

      it('should throw ENOENT for missing directory', async () => {
        await expect(fs.rmdir('/missing')).rejects.toThrow('ENOENT')
      })
    })

    describe('readdir()', () => {
      it('should list directory contents', async () => {
        await fs.mkdir('/dir')
        await fs.writeFile('/dir/a.txt', 'a')
        await fs.writeFile('/dir/b.txt', 'b')
        await fs.mkdir('/dir/subdir')

        const entries = await fs.readdir('/dir')

        expect(entries).toContain('a.txt')
        expect(entries).toContain('b.txt')
        expect(entries).toContain('subdir')
      })

      it('should return Dirent objects with withFileTypes', async () => {
        await fs.mkdir('/typed')
        await fs.writeFile('/typed/file.txt', 'content')
        await fs.mkdir('/typed/subdir')

        const entries = await fs.readdir('/typed', { withFileTypes: true })

        expect(entries).toHaveLength(2)

        // Type assertion since readdir returns Dirent[] when withFileTypes is true
        const dirents = entries as import('../types/execution').Dirent[]
        const file = dirents.find((e) => e.name === 'file.txt')
        const dir = dirents.find((e) => e.name === 'subdir')

        expect(file?.isFile()).toBe(true)
        expect(file?.isDirectory()).toBe(false)
        expect(dir?.isFile()).toBe(false)
        expect(dir?.isDirectory()).toBe(true)
      })

      it('should throw ENOENT for missing directory', async () => {
        await expect(fs.readdir('/missing')).rejects.toThrow('ENOENT')
      })
    })

    describe('stat()', () => {
      it('should return file stats', async () => {
        await fs.writeFile('/file.txt', 'hello world')
        const stats = await fs.stat('/file.txt')

        expect(stats.size).toBe(11)
        expect(stats.isFile()).toBe(true)
        expect(stats.isDirectory()).toBe(false)
      })

      it('should return directory stats', async () => {
        await fs.mkdir('/dir')
        const stats = await fs.stat('/dir')

        expect(stats.isFile()).toBe(false)
        expect(stats.isDirectory()).toBe(true)
      })

      it('should include timestamps', async () => {
        await fs.writeFile('/timed.txt', 'data')
        const stats = await fs.stat('/timed.txt')

        expect(stats.atimeMs).toBeGreaterThan(0)
        expect(stats.mtimeMs).toBeGreaterThan(0)
        expect(stats.birthtimeMs).toBeGreaterThan(0)
        expect(stats.atime).toBeInstanceOf(Date)
        expect(stats.mtime).toBeInstanceOf(Date)
        expect(stats.birthtime).toBeInstanceOf(Date)
      })

      it('should throw ENOENT for missing path', async () => {
        await expect(fs.stat('/missing')).rejects.toThrow('ENOENT')
      })
    })

    describe('unlink()', () => {
      it('should delete files', async () => {
        await fs.writeFile('/delete.txt', 'content')
        await fs.unlink('/delete.txt')

        expect(await fs.exists('/delete.txt')).toBe(false)
      })

      it('should throw ENOENT for missing files', async () => {
        await expect(fs.unlink('/missing.txt')).rejects.toThrow('ENOENT')
      })
    })

    describe('rename()', () => {
      it('should rename files', async () => {
        await fs.writeFile('/old.txt', 'content')
        await fs.rename('/old.txt', '/new.txt')

        expect(await fs.exists('/old.txt')).toBe(false)
        expect(await fs.exists('/new.txt')).toBe(true)
        expect(await fs.readFile('/new.txt', 'utf-8')).toBe('content')
      })

      it('should throw ENOENT for missing source', async () => {
        await expect(fs.rename('/missing.txt', '/new.txt')).rejects.toThrow(
          'ENOENT'
        )
      })
    })

    describe('copyFile()', () => {
      it('should copy files', async () => {
        await fs.writeFile('/original.txt', 'content')
        await fs.copyFile('/original.txt', '/copy.txt')

        expect(await fs.readFile('/original.txt', 'utf-8')).toBe('content')
        expect(await fs.readFile('/copy.txt', 'utf-8')).toBe('content')
      })
    })

    describe('exists()', () => {
      it('should return true for existing files', async () => {
        await fs.writeFile('/exists.txt', 'data')

        expect(await fs.exists('/exists.txt')).toBe(true)
      })

      it('should return true for existing directories', async () => {
        await fs.mkdir('/existsdir')

        expect(await fs.exists('/existsdir')).toBe(true)
      })

      it('should return false for missing paths', async () => {
        expect(await fs.exists('/missing')).toBe(false)
      })
    })

    describe('realpath()', () => {
      it('should return normalized path', async () => {
        await fs.writeFile('/file.txt', 'data')
        const path = await fs.realpath('/file.txt')

        expect(path).toBe('/file.txt')
      })

      it('should throw ENOENT for missing path', async () => {
        await expect(fs.realpath('/missing')).rejects.toThrow('ENOENT')
      })
    })

    describe('symlink() and readlink()', () => {
      it('should throw not supported error', async () => {
        await expect(fs.symlink('/target', '/link')).rejects.toThrow(
          'not supported'
        )
        await expect(fs.readlink('/link')).rejects.toThrow('not supported')
      })
    })

    describe('chmod()', () => {
      it('should update file mode', async () => {
        await fs.writeFile('/file.txt', 'data')
        await fs.chmod('/file.txt', 0o755)

        const stats = await fs.stat('/file.txt')
        expect(stats.mode).toBe(0o755)
      })
    })

    describe('truncate()', () => {
      it('should truncate file to specified length', async () => {
        await fs.writeFile('/truncate.txt', 'hello world')
        await fs.truncate('/truncate.txt', 5)
        const content = await fs.readFile('/truncate.txt', 'utf-8')

        expect(content).toBe('hello')
      })

      it('should truncate to zero by default', async () => {
        await fs.writeFile('/truncate.txt', 'content')
        await fs.truncate('/truncate.txt')
        const content = await fs.readFile('/truncate.txt', 'utf-8')

        expect(content).toBe('')
      })
    })

    describe('utimes()', () => {
      it('should update access and modification times', async () => {
        await fs.writeFile('/timed.txt', 'data')
        const atime = new Date('2024-01-01')
        const mtime = new Date('2024-06-15')

        await fs.utimes('/timed.txt', atime, mtime)

        const stats = await fs.stat('/timed.txt')
        expect(stats.atime.getTime()).toBe(atime.getTime())
        expect(stats.mtime.getTime()).toBe(mtime.getTime())
      })
    })

    describe('Path normalization', () => {
      it('should normalize trailing slashes', async () => {
        await fs.mkdir('/normalized/')
        expect(await fs.exists('/normalized')).toBe(true)
      })

      it('should handle relative-like paths', async () => {
        await fs.writeFile('relative.txt', 'data')
        expect(await fs.exists('/relative.txt')).toBe(true)
      })
    })
  })

  describe('R2FileSystem', () => {
    it('should throw without bucket configured', async () => {
      const fs = new R2FileSystem()

      await expect(fs.readFile('/test.txt')).rejects.toThrow(
        'R2 bucket not configured'
      )
    })
  })

  describe('KVFileSystem', () => {
    it('should throw without namespace configured', async () => {
      const fs = new KVFileSystem()

      await expect(fs.readFile('/test.txt')).rejects.toThrow(
        'KV namespace not configured'
      )
    })
  })

  describe('SQLiteFileSystem', () => {
    it('should throw not implemented', async () => {
      const fs = new SQLiteFileSystem()

      await expect(fs.readFile('/test.txt')).rejects.toThrow(
        'D1 database not configured'
      )
    })
  })
})
