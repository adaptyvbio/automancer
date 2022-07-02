from pathlib import Path
from setuptools import find_packages, setup

setup(
  name="stdio-server",
  version="0.0.0",

  packages=find_packages(),

  install_requires=[
    "appdirs==1.4.4",
    "pyinstaller==5.1"
  ]
)
