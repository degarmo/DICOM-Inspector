import { describe, expect, it } from 'vitest'

import { ENGINE_MISSING_TITLE, engineMissingHtml, engineMissingPage } from './engineMissing'

describe('engine missing screen', () => {
  const path = 'C:\\Program Files\\DICOM Inspector\\resources\\engine\\dicom_inspector_engine.exe'

  it('tells the user to reinstall and shows where the engine was expected', () => {
    const html = engineMissingHtml(path)
    expect(ENGINE_MISSING_TITLE).toBe('Engine not found \u2014 reinstall DICOM Inspector')
    expect(html).toContain(`<h1>${ENGINE_MISSING_TITLE}</h1>`)
    expect(html).toContain(path)
  })

  it('is static: no scripts and no external references', () => {
    const html = engineMissingHtml('<b>x</b>')
    expect(html).not.toMatch(/<script|\bsrc=|\bhref=|https?:/i)
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(engineMissingPage(path).startsWith('data:text/html;charset=utf-8,')).toBe(true)
  })
})
