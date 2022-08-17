from setuptools import find_packages, setup

setup(
  name="pr1_mfcontrol",
  version="0.0.0",

  packages=find_packages(where="src"),
  package_dir={"": "src"},

  entry_points={
    'pr1.units': [
      "mfcontrol = pr1_mfcontrol",
    ]
  },
  package_data={
    "pr1_mfcontrol.client": ["*"]
  }
)
