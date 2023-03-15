from setuptools import find_packages, setup

setup(
  name="pr1_expect",
  version="0.0.0",

  packages=find_packages(where="src"),
  package_dir={"": "src"},

  entry_points={
    'pr1.units': [
      "expect = pr1_expect"
    ]
  },
  package_data={
    "pr1_expect.client": ["*"]
  }
)
