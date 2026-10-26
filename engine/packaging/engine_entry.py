"""Entry point of the frozen engine; behaves exactly like `python -m dicom_inspector`."""

from dicom_inspector.cli import main

raise SystemExit(main())
