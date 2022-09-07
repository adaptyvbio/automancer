#!/bin/bash

set -e
cd "$(dirname "$0")"
python3 -m venv tmp/env
source tmp/env/bin/activate
cd ../..
pip install ../server --target tmp/resources/beta/packages --upgrade
pip install ../../host --target tmp/resources/beta/packages --upgrade
pip install ../../units/builtin --target tmp/resources/beta/packages --upgrade
pip install ../../units/amf --target tmp/resources/beta/packages --upgrade
pip install ../../units/mfcontrol --target tmp/resources/beta/packages --upgrade
pip install ../../units/numato --target tmp/resources/beta/packages --upgrade
pip install ../../units/opcua --target tmp/resources/beta/packages --upgrade
python --version | awk '{ printf $2 }' > tmp/resources/beta/version.txt
deactivate
