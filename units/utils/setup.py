from setuptools import find_packages, setup

setup(
  name="pr1_utils",
  version="0.0.0",

  packages=find_packages(where="src"),
  package_dir={"": "src"},

  entry_points={
    'pr1.units': [
      "utils = pr1_utils",
    ]
  },
  package_data={
    "pr1_utils.client": ["*"]
  }
)
