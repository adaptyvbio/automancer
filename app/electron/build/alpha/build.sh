#!/bin/bash

set -e
cd "$(dirname "$0")"
python3 -m venv tmp/env
source tmp/env/bin/activate
cd ../..
pip install ../server
pip install ../../host
pip install ../../units/builtin
pip install ../../units/gpio
pyinstaller --distpath tmp/resources/alpha --noconfirm build/alpha/main.spec --workpath build/alpha/tmp/build
deactivate
