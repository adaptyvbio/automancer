#!/bin/bash

set -e
cd "$(dirname "$0")"
cd ..
pip3 wheel --no-deps --wheel-dir packages ../server
pip3 wheel --no-deps --wheel-dir packages ../../host
pip3 wheel --no-deps --wheel-dir packages ../../units/core
cd -
