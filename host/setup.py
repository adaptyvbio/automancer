from setuptools import find_packages, setup

setup(
  name="pr1",
  version="0.0.0",

  packages=find_packages(),

  install_requires=[
    "numpy==1.22.3",
    "pint==0.20.1",
    "regex==2022.8.17",
    "uncertainties==3.1.7"
  ]
)
