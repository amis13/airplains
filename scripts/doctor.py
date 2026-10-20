#!/usr/bin/env python3
"""Diagnóstico de solo lectura. No modifica el Pluto, WSL ni la red."""
import argparse
import ctypes.util
import os
from pathlib import Path
import platform
import shutil
import socket
import subprocess
import sys


def main():
    config = {}
    env_file = Path(__file__).resolve().parents[1] / '.env'
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                config[key.strip()] = value.strip().strip('\"\'')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pluto', default=os.getenv('PLUTO_HOST') or config.get('PLUTO_HOST') or '192.168.2.1')
    args = parser.parse_args()
    host = os.getenv('SBS_HOST', config.get('SBS_HOST', '127.0.0.1'))
    try:
        port = int(os.getenv('SBS_PORT', config.get('SBS_PORT', '30003')))
        if not 1 <= port <= 65535:
            raise ValueError()
    except ValueError:
        print('[ERROR] SBS_PORT debe estar entre 1 y 65535')
        return 1
    print('Airplains · diagnóstico Windows/WSL')
    print('Sistema:', platform.release())
    for command in ['node', 'npm', 'git', 'make', 'gcc', 'iio_info']:
        print(f'[{"OK" if shutil.which(command) else "FALTA"}] {command}')
    print(f'[{"OK" if ctypes.util.find_library("iio") else "FALTA"}] libiio')
    print(f'[{"OK" if ctypes.util.find_library("ad9361") else "FALTA"}] libad9361')
    results = []
    for title, hostname, number in [('Pluto HTTP', args.pluto, 80), ('Pluto IIO', args.pluto, 30431), ('Decodificador SBS', host, port)]:
        try:
            with socket.create_connection((hostname, number), timeout=2):
                print(f'[OK] {title}: {hostname}:{number}')
                results.append(True)
        except OSError as error:
            print(f'[NO DISPONIBLE] {title}: {hostname}:{number} · {error}')
            results.append(False)
    if results[1] and shutil.which('iio_info'):
        result = subprocess.run(['iio_info', '-u', f'ip:{args.pluto}'], capture_output=True, text=True, timeout=8)
        print(f'[{"OK" if result.returncode == 0 else "ERROR"}] Consulta de dispositivos IIO')
        print((result.stdout + result.stderr)[:5000])
    if not results[1]:
        print('\nAbre http://' + args.pluto + ' desde Windows. Si funciona allí pero no en WSL,')
        print('comprueba la ruta entre WSL y el adaptador USB de red del Pluto. Consulta README.md.')
        print('Si has cambiado la IP: npm run doctor -- --pluto DIRECCION_IP')
    if not results[2]:
        print('\nInicia el decodificador con --net. El mapa reintentará la conexión automáticamente.')
    return 0 if results[1] and results[2] else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except subprocess.TimeoutExpired:
        print('[ERROR] La consulta IIO ha agotado el tiempo de espera.')
        sys.exit(1)
