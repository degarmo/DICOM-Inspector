"""DICOM Inspector comparison engine.

Read-only: files are opened for reading only, pixel data is never loaded,
and nothing is sent over the network.
"""

from dicom_inspector.schema import SCHEMA_VERSION

__version__ = "0.1.0"

__all__ = ["SCHEMA_VERSION", "__version__"]
