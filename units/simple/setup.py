from setuptools import find_packages, setup

setup(
  name="pr1_simple",
  version="0.0.0",

  packages=find_packages(where="src"),
  package_dir={"": "src"},

  entry_points={
    'pr1.units': [
      "simple = pr1_simple",
    ]
  },
  package_data={
    "pr1_simple.client": ["*"]
  }
)
