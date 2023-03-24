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
    "amf-rotary-valve==0.1.0"
  ]
)
