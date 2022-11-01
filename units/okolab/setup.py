from setuptools import find_packages, setup

setup(
  name="pr1_okolab",
  version="0.0.0",

  packages=find_packages(where="src"),
  package_dir={"": "src"},

  entry_points={
    'pr1.units': [
      "okolab = pr1_okolab",
    ]
  },

  install_requires=[
    "okolab==0.1.0"
  ]
)
