"""PyInstaller hook for pydicom, replacing the one in pyinstaller-hooks-contrib.

The contrib hook also collects test and palette data files, which the engine
never uses. This hook collects only the data that importing pydicom requires
(hidden imports are listed explicitly in dicom_inspector_engine.spec): `pydicom.examples` runs at import time and reads
`data/urls.json` and `data/hashes.json`. The example datasets are not listed in
urls.json, so without the bundled test files pydicom returns None for them and
never attempts a download.
"""

from PyInstaller.utils.hooks import collect_data_files

hiddenimports = []
datas = collect_data_files("pydicom.data", includes=["urls.json", "hashes.json"])
