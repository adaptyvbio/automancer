from setuptools import find_packages, setup

setup(
  name="pr1_builtin",
  version="0.0.0",

  packages=find_packages(where="src"),
  package_dir={"": "src"},

  entry_points={
    'pr1.units': [
      "builtin_constructs = pr1_builtin_constructs",
      "devices = pr1_devices",
      "idle = pr1_idle",
      "metadata = pr1_metadata",
      "say = pr1_say",
      "timer = pr1_timer"
    ]
  },
  package_data={
    "pr1_devices.client": ["*"],
    "pr1_idle.client": ["*"],
    "pr1_metadata.client": ["*"],
    "pr1_say.client": ["*"],
    "pr1_timer.client": ["*"]
  },

  install_requires=[
    "regex==2022.8.17"
  ]
)
