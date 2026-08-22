#!/usr/bin/env python3
"""Generate a registration code compatible with the server verifier."""

import argparse
import hashlib
import hmac
import time


def generate_registration_code(qq: str, secret: str, timestamp: int) -> str:
    message = f"{qq}.{timestamp}".encode()
    signature = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return f"{timestamp}.{signature}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("qq")
    parser.add_argument("--secret", required=True)
    parser.add_argument("--timestamp", type=int, default=int(time.time()))
    args = parser.parse_args()
    print(generate_registration_code(args.qq, args.secret, args.timestamp))


if __name__ == "__main__":
    main()
