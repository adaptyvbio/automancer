from setuptools import find_packages, setup

setup(
  name="pr1_builtin",
  version="0.0.0",

  packages=find_packages(where="src"),
  package_dir={"": "src"},

  entry_points={
    'pr1.units': [
      "builtin_constructs = pr1_builtin_constructs",
      "idle = pr1_idle",
      "metadata = pr1_metadata",
      "say = pr1_say",
      "timer = pr1_timer"
    ]
  },
  package_data={
    "pr1_builtin_constructs.client": ["*"],
    "pr1_idle.client": ["*"],
    "pr1_metadata.client": ["*"],
    "pr1_say.client": ["*"],
    "pr1_timer.client": ["*"]
  }
)
