#!/bin/bash

set -e
python3 -m venv env
source env/bin/activate
pip install ../../host
pip install ../../units/builtin
pip install .
pyinstaller --noconfirm main.spec
deactivate
