/** Builders for engine results used by tests. Shapes follow engine/dicom_inspector/schema.py. */
import { SCHEMA_VERSION, type CompareResult, type FileInfo, type ReportWarning, type Row } from '../shared/schema'

export function makeRow(overrides: Partial<Row> & Pick<Row, 'path'>): Row {
  const tag = overrides.tag ?? overrides.path.slice(-11)
  return {
    keyword_path: overrides.keyword ?? tag,
    tag,
    keyword: '',
    vr: 'LO',
    value_a: 'A',
    value_b: 'A',
    status: 'identical',
    is_private: false,
    private_creator: null,
    is_priority: false,
    vr_a: 'LO',
    vr_b: 'LO',
    vr_mismatch: false,
    ...overrides,
  }
}

export function makeFile(name: string, overrides: Partial<FileInfo> = {}): FileInfo {
  return {
    path: `/data/${name}`,
    size_bytes: 740,
    sha256: `${name.length.toString(16).padStart(2, '0')}${'ab'.repeat(31)}`,
    transfer_syntax: { uid: '1.2.840.10008.1.2.1', name: 'Explicit VR Little Endian' },
    sop_class: { uid: '1.2.840.10008.5.1.4.1.1.7', name: 'Secondary Capture Image Storage' },
    ...overrides,
  }
}

export function makeResult(rows: Row[], warnings: ReportWarning[] = []): CompareResult {
  const count = (status: Row['status']): number => rows.filter((r) => r.status === status).length
  return {
    schema_version: SCHEMA_VERSION,
    files: { a: makeFile('a.dcm'), b: makeFile('b.dcm', { size_bytes: 836 }) },
    summary: {
      total: rows.length,
      identical: count('identical'),
      different: count('different'),
      only_in_a: count('only_in_a'),
      only_in_b: count('only_in_b'),
      priority_mismatches: rows.filter((r) => r.is_priority && r.status !== 'identical').length,
    },
    warnings,
    rows,
  }
}

/** A small result with every status, a priority mismatch, a private block and a nested row. */
export function sampleResult(): CompareResult {
  return makeResult([
    makeRow({ path: '(0002,0010)', keyword: 'TransferSyntaxUID', keyword_path: 'TransferSyntaxUID', vr: 'UI', vr_a: 'UI', vr_b: 'UI', value_a: '1.2.840.10008.1.2.1', value_b: '1.2.840.10008.1.2.1', is_priority: true }),
    makeRow({ path: '(0008,0050)', keyword: 'AccessionNumber', keyword_path: 'AccessionNumber', vr: 'SH', vr_a: 'SH', vr_b: 'SH', value_a: 'SYNACC0001', value_b: '', status: 'different', is_priority: true }),
    makeRow({ path: '(0008,0008)', keyword: 'ImageType', keyword_path: 'ImageType', vr: 'CS', vr_a: 'CS', vr_b: 'CS', value_a: ['ORIGINAL', 'PRIMARY'], value_b: ['ORIGINAL', 'PRIMARY'] }),
    makeRow({ path: '(0008,1030)', keyword: 'StudyDescription', keyword_path: 'StudyDescription', vr_b: 'SH', value_a: 'SYNTHETIC STUDY', value_b: 'SYNTHETIC STUDY', status: 'different', vr_mismatch: true }),
    makeRow({ path: '(0008,1115)[0].(0008,1155)', tag: '(0008,1155)', keyword: 'ReferencedSOPInstanceUID', keyword_path: 'ReferencedSeriesSequence[0].ReferencedSOPInstanceUID', vr: 'UI', vr_a: 'UI', vr_b: 'UI', value_a: '2.25.3001', value_b: '2.25.3002', status: 'different' }),
    makeRow({ path: '(0009,0010)', value_a: null, vr_a: null, value_b: 'SYNTHETIC_VENDOR_1', status: 'only_in_b', is_private: true, private_creator: 'SYNTHETIC_VENDOR_1', is_priority: true }),
    makeRow({ path: '(0010,1000)', keyword: 'OtherPatientIDs', keyword_path: 'OtherPatientIDs', value_a: 'OLD-ID', value_b: null, vr_b: null, status: 'only_in_a' }),
  ])
}

/** list[index], failing the test if it is missing. */
export function at<T>(list: readonly T[], index: number): T {
  const item = list[index]
  if (item === undefined) throw new Error(`Expected an item at index ${index}, list has ${list.length}`)
  return item
}
