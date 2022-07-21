import base64
import pickle


def encode(data):
    return base64.b85encode(pickle.dumps(data)).decode("utf-8")

def decode(data):
    return pickle.loads(base64.b85decode(data.encode("utf-8")))
