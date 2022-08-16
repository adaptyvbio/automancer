from setuptools import find_packages, setup

setup(
  name="pr1_gpio",
  version="0.0.0",

  packages=find_packages(where="src"),
  package_dir={"": "src"},

  entry_points={
    'pr1.units': [
      "gpio = pr1_gpio",
    ]
  },
  package_data={
    "pr1_gpio.pr1_gpio.client": ["*.js"]
  }
)
