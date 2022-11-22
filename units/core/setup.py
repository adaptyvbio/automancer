from setuptools import find_packages, setup

setup(
  name="pr1_core",
  version="0.0.0",

  packages=find_packages(where="src"),
  package_dir={"": "src"},

  entry_points={
    'pr1.units': [
      "segment = pr1_segment",
      "sequence = pr1_sequence",
      "timer = pr1_timer"
    ]
  },
  package_data={
    "pr1_segment.client": ["*"],
    "pr1_sequence.client": ["*"],
    "pr1_timer.client": ["*"]
  }
)
