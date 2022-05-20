from setuptools import find_packages, setup

setup(
  name="pr1",
  version="0.0.0",

  packages=find_packages(),

  install_requires=[
    "appdirs==1.4.4",
    "pyserial==3.5",
    "regex==2022.3.15"
  ]
)
