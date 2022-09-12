from setuptools import find_packages, setup

setup(
  name="pr1_numato",
  version="0.0.0",

  packages=find_packages(where="src"),
  package_dir={"": "src"},

  entry_points={
    'pr1.units': [
      "numato = pr1_numato"
    ]
  },
  package_data={
    "pr1_numato.data": ["*"]
  },

  install_requires=[
    "aioserial==1.3.1",
    "pyserial==3.5"
  ]
)
