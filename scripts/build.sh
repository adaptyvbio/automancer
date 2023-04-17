#!/bin/bash

set -e
cd "$(dirname "$0")"
cd ..

python3 -m build --outdir scripts/tmp/packages host
python3 -m build --outdir scripts/tmp/packages app/server
python3 -m build --outdir scripts/tmp/packages units/amf
python3 -m build --outdir scripts/tmp/packages units/core

pip3 install twine
python3 -m twine upload --repository-url https://gitlab.com/api/v4/projects/45232449/packages/pypi --skip-existing --verbose scripts/tmp/packages/*

cd -
