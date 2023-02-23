from setuptools import find_packages, setup

setup(
  name="pr1_core",
  version="0.0.0",

  packages=find_packages(where="src"),
  package_dir={"": "src"},

  entry_points={
    'pr1.units': [
      "devices = pr1_devices",
      "do = pr1_do",
      "metadata = pr1_metadata",
      "name = pr1_name",
      "repeat = pr1_repeat",
      "segment = pr1_segment",
      "sequence = pr1_sequence",
      "shorthands = pr1_shorthands",
      "state = pr1_state",
      "timer = pr1_timer"
    ]
  },
  package_data={
    "pr1_devices.client": ["*"],
    "pr1_metadata.client": ["*"],
    "pr1_repeat.client": ["*"],
    "pr1_segment.client": ["*"],
    "pr1_sequence.client": ["*"],
    "pr1_state.client": ["*"],
    "pr1_timer.client": ["*"]
  }
)
