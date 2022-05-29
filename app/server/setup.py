from setuptools import find_packages, setup

name = "pr1_server"


setup(
  name="pr1_server",
  version="0.0.0",

  packages=find_packages(),

  entry_points={
    "console_scripts": [
      "pr1=pr1_server:main"
    ]
  },

  install_requires=[
    "bcrypt==3.2.2",
    "websockets==10.2"
  ]
)
