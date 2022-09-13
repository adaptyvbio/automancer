from setuptools import find_packages, setup

setup(
  name="pr1_adaptyv_nikon",
  version="0.0.0",

  packages=find_packages(where="src"),
  package_dir={"": "src"},

  entry_points={
    'pr1.units': [
      "adaptyv_nikon = pr1_adaptyv_nikon",
    ]
  },
  package_data={
    "pr1_adaptyv_nikon.client": ["*"],
    "pr1_adaptyv_nikon.macros": ["*"]
  }
)
