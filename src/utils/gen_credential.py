import sys, os
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.x509 import load_pem_x509_certificate
from cryptography.hazmat.backends import default_backend
import base64

cert_path = sys.argv[1]
password  = os.environ['MPESA_B2C_PASSWORD']

with open(cert_path, 'rb') as f:
    cert = load_pem_x509_certificate(f.read(), default_backend())
enc = cert.public_key().encrypt(password.encode(), padding.PKCS1v15())
print(base64.b64encode(enc).decode(), end='')
