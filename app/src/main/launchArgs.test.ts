import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { absoluteArgs, launchArgsFromData, parseLaunchArgs, resolveOpenRequest } from './launchArgs'

const EXE = 'C:\\Program Files\\DICOM Inspector\\DICOM Inspector.exe'

describe('parseLaunchArgs (packaged)', () => {
  it('takes two paths and --compare', () => {
    expect(parseLaunchArgs([EXE, 'a.dcm', 'b.dcm', '--compare'], false)).toEqual({
      files: ['a.dcm', 'b.dcm'],
      compare: true,
    })
  })

  it('keeps paths with spaces and Unicode intact', () => {
    const a = 'C:\\Scans\\Study One\\rest image.dcm'
    const b = 'C:\\Scans\\Pr\u00fcfung \u691c\u67fb\\T\u00e9st B.dcm'
    expect(parseLaunchArgs([EXE, '--compare', a, b], false)).toEqual({ files: [a, b], compare: true })
  })

  it('accepts --compare anywhere and ignores other switches', () => {
    expect(
      parseLaunchArgs([EXE, '--allow-file-access-from-files', 'a.dcm', '--compare', '--inspect=0', 'b.dcm'], false),
    ).toEqual({ files: ['a.dcm', 'b.dcm'], compare: true })
  })

  it('treats everything after -- as a path', () => {
    expect(parseLaunchArgs([EXE, '--compare', '--', '-scan.dcm', '--compare'], false)).toEqual({
      files: ['-scan.dcm', '--compare'],
      compare: true,
    })
  })

  it('handles zero, one and more than two paths', () => {
    expect(parseLaunchArgs([EXE], false)).toEqual({ files: [], compare: false })
    expect(parseLaunchArgs([EXE, 'only.dcm'], false)).toEqual({ files: ['only.dcm'], compare: false })
    expect(parseLaunchArgs([EXE, '1.dcm', '2.dcm', '3.dcm'], false).files).toEqual(['1.dcm', '2.dcm'])
  })
})

describe('parseLaunchArgs (electron <appDir>, dev mode and tests)', () => {
  it('skips the app directory, including after switches added by test runners', () => {
    const argv = ['/x/electron', '--inspect=0', '--remote-debugging-port=0', '/repo/app', 'a b.dcm', 'b.dcm', '--compare']
    expect(parseLaunchArgs(argv, true)).toEqual({ files: ['a b.dcm', 'b.dcm'], compare: true })
  })

  it('returns no files when only the app directory is given', () => {
    expect(parseLaunchArgs(['/x/electron', '.'], true)).toEqual({ files: [], compare: false })
  })
})

describe('absoluteArgs', () => {
  it('resolves relative paths against the launch directory', () => {
    const cwd = resolve('/Scans/Study One')
    expect(absoluteArgs({ files: ['A.dcm', '../Pr\u00fcfung/B.dcm'], compare: true }, cwd)).toEqual({
      files: [resolve(cwd, 'A.dcm'), resolve('/Scans/Pr\u00fcfung/B.dcm')],
      compare: true,
    })
  })
})

describe('launchArgsFromData (second instance)', () => {
  it('accepts a well-formed request and rejects anything else', () => {
    expect(launchArgsFromData({ files: ['/a.dcm', '/b.dcm'], compare: true })).toEqual({
      files: ['/a.dcm', '/b.dcm'],
      compare: true,
    })
    expect(launchArgsFromData({ files: ['/a.dcm', 7, '/b.dcm', '/c.dcm'], compare: 'yes' })).toEqual({
      files: ['/a.dcm', '/b.dcm'],
      compare: false,
    })
    expect(launchArgsFromData(null)).toEqual({ files: [], compare: false })
    expect(launchArgsFromData('a.dcm')).toEqual({ files: [], compare: false })
  })
})

describe('resolveOpenRequest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dicom-inspector-args-'))
  const unicodeDir = join(dir, 'T\u00e9st\u00e9 dossier')
  mkdirSync(unicodeDir)
  const a = join(unicodeDir, 'rest image A.dcm')
  const b = join(unicodeDir, '\u691c\u67fb B.dcm')
  writeFileSync(a, Buffer.alloc(740))
  writeFileSync(b, Buffer.alloc(836))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('loads real files whose paths contain spaces and Unicode', async () => {
    expect(await resolveOpenRequest({ files: [a, b], compare: true })).toEqual({
      files: {
        a: { path: a, name: 'rest image A.dcm', size: 740 },
        b: { path: b, name: '\u691c\u67fb B.dcm', size: 836 },
      },
      compare: true,
      errors: [],
    })
  })

  it('reports a missing file as file_not_found and does not compare', async () => {
    const missing = join(unicodeDir, 'missing.dcm')
    expect(await resolveOpenRequest({ files: [a, missing], compare: true })).toEqual({
      files: { a: { path: a, name: 'rest image A.dcm', size: 740 }, b: null },
      compare: false,
      errors: [{ code: 'file_not_found', message: `File not found: ${missing}`, file: missing }],
    })
  })

  it('reports a directory as not_a_file', async () => {
    const request = await resolveOpenRequest({ files: [unicodeDir, b], compare: false })
    expect(request?.errors).toEqual([
      { code: 'not_a_file', message: `Not a regular file: ${unicodeDir}`, file: unicodeDir },
    ])
    expect(request?.files.a).toBeNull()
  })

  it('returns null when no files were given', async () => {
    expect(await resolveOpenRequest({ files: [], compare: true })).toBeNull()
  })
})
