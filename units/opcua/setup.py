from setuptools import find_packages, setup

setup(
  name="pr1_opcua",
  version="0.0.0",

  packages=find_packages(where="src"),
  package_dir={"": "src"},

  entry_points={
    'pr1.units': [
      "opcua = pr1_opcua",
    ]
  },
  package_data={
    "pr1_opcua.client": ["*"]
  },

  install_requires=[
    "asyncua==0.9.94"
  ]
)
