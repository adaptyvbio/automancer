from setuptools import find_packages, setup

setup(
  name="pr1_builtin",
  version="0.0.0",

  packages=find_packages(where="src"),
  package_dir={"": "src"},

  entry_points={
    'pr1.units': [
      "say = pr1_say",
    ]
  },
  package_data={
    "pr1_builtin.say.client": ["*.js"]
  }
)
