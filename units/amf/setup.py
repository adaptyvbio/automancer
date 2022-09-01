from setuptools import find_packages, setup

setup(
  name="pr1_amf",
  version="0.0.0",

  packages=find_packages(where="src"),
  package_dir={"": "src"},

  entry_points={
    'pr1.units': [
      "amf = pr1_amf",
    ]
  },
  package_data={
    "pr1_amf.client": ["*"],
    "pr1_amf.data": ["*"]
  },

  install_requires=[
    "pyserial==3.5",
    "pyserial-asyncio==0.5"
  ]
)
