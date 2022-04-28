from setuptools import find_packages, setup

name = "pr1"
dir_name = "runner"


# def transform(pkg_name):
#   if pkg_name == dir_name:
#     return name
#   else:
#     return name + pkg_name[pkg_name.find("."):]

# print(find_packages())
# xx()


setup(
  name=name,
  version="0.0.0",

  packages=find_packages(),
  # packages=[
  #   # transform(pkg_name) for pkg_name in packages if (pkg_name == dir_name) or pkg_name.startswith(dir_name + ".")
  #   f"{name}.{pkg_name}" for pkg_name in find_packages("src")
  # ],
  # package_dir={ "pr1": "src" },

  entry_points={
    "console_scripts": [
      "pr1=pr1.app:main"
    ]
  },

  install_requires=[
    "appdirs==1.4.4",
    "pyserial==3.5",
    "regex==2022.3.2",
    "websockets==10.2"
  ]
)
