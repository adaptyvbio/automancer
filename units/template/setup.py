from setuptools import find_packages, setup

setup(
  name="pr1_template",
  version="0.0.0",

  packages=find_packages(where="src"),
  package_dir={"": "src"},

  entry_points={
    'pr1.units': [
      "template = pr1_template",
    ]
  },
  package_data={
    "pr1_template.pr1_template.client": ["*.js"]
  }
)
