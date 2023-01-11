from setuptools import find_packages, setup

setup(
  name="pr1_s3",
  version="0.0.0",

  packages=find_packages(where="src"),
  package_dir={"": "src"},

  entry_points={
    'pr1.units': [
      "s3 = pr1_s3",
    ]
  },
  package_data={
    "pr1_s3.client": ["*"]
  },

  install_requires=[
    "boto3==1.26.46"
  ]
)
