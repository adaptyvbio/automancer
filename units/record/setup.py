from setuptools import find_packages, setup

setup(
  name="pr1_record",
  version="0.0.0",

  packages=find_packages(where="src"),
  package_dir={"": "src"},

  entry_points={
    'pr1.units': [
      "record = pr1_record",
    ]
  },
  package_data={
    "pr1_record.client": ["*"]
  },

  install_requires=[
    "numpy>=1.23.0",
    "pandas>=1.5.0"
  ]
)
