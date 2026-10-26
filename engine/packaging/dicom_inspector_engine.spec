# PyInstaller spec for the frozen DICOM Inspector engine (onedir).
#
# Build from engine/ (build_engine.ps1 does this):
#   pyinstaller --noconfirm --clean --distpath dist --workpath build/pyinstaller packaging/dicom_inspector_engine.spec
# Output: dist/dicom_inspector_engine/dicom_inspector_engine(.exe)

from pathlib import Path

PACKAGING_DIR = Path(SPECPATH)
ENGINE_DIR = PACKAGING_DIR.parent

# Modules that static analysis cannot see.
#
# pydicom.charset turns each Specific Character Set defined term into a Python
# codec name and decodes with bytes.decode(name); the codec module is then
# imported by name at run time. One entry per codec pydicom maps (including its
# default, iso8859 -> latin_1), plus the C modules behind the CJK codecs.
HIDDEN_IMPORTS = [
    "encodings.euc_kr",
    "encodings.gb18030",
    "encodings.gb2312",
    "encodings.gbk",
    "encodings.iso2022_jp",
    "encodings.iso2022_jp_2",
    "encodings.iso8859_2",
    "encodings.iso8859_3",
    "encodings.iso8859_4",
    "encodings.iso8859_5",
    "encodings.iso8859_6",
    "encodings.iso8859_7",
    "encodings.iso8859_8",
    "encodings.iso8859_9",
    "encodings.latin_1",
    "encodings.shift_jis",
    "encodings.tis_620",
    "encodings.utf_8",
    "_codecs_cn",
    "_codecs_iso2022",
    "_codecs_jp",
    "_codecs_kr",
    "_multibytecodec",
    # `import pydicom` registers its pixel encoder/decoder plugins by module name
    # (pydicom.pixels.common.add_plugin -> importlib.import_module), so these small
    # pure-Python shims must be present even though the engine never reads pixel
    # data. The codec libraries they wrap are excluded below.
    "pydicom.pixels.decoders.gdcm",
    "pydicom.pixels.decoders.pillow",
    "pydicom.pixels.decoders.pyjpegls",
    "pydicom.pixels.decoders.pylibjpeg",
    "pydicom.pixels.decoders.rle",
    "pydicom.pixels.encoders.gdcm",
    "pydicom.pixels.encoders.native",
    "pydicom.pixels.encoders.pyjpegls",
    "pydicom.pixels.encoders.pylibjpeg",
]

# Optional pixel-data and download libraries that pydicom imports when present.
# The engine never reads pixel data or downloads anything, so keep them out even
# if they happen to be installed in the build environment.
EXCLUDES = [
    "numpy",
    "PIL",
    "pylibjpeg",
    "openjpeg",
    "libjpeg",
    "rle",
    "gdcm",
    "jpeg_ls",
    "pyjpegls",
    "requests",
    "tqdm",
    "tkinter",
]

a = Analysis(
    [str(PACKAGING_DIR / "engine_entry.py")],
    pathex=[str(ENGINE_DIR)],
    binaries=[],
    datas=[],
    hiddenimports=HIDDEN_IMPORTS,
    hookspath=[str(PACKAGING_DIR / "hooks")],
    hooksconfig={},
    runtime_hooks=[],
    excludes=EXCLUDES,
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="dicom_inspector_engine",
    console=True,
    debug=False,
    strip=False,
    upx=False,
    disable_windowed_traceback=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="dicom_inspector_engine",
)
