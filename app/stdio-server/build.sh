python3 -m venv env
source env/bin/activate
python setup.py install
pip install ../../host
pyinstaller --noconfirm main.spec
deactivate
