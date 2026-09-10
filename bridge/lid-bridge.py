#!/usr/bin/env python3
"""Stream the MacBook lid angle to iPhone Solo.

Polls Apple's lid angle sensor with HID feature reports
sixty times a second (the high-rate path)
and serves it as text/event-stream on /lid.

    python3 lid-bridge.py
    python3 lid-bridge.py --serve

The first run creates a private virtualenv
under ~/Library/Application Support/iPhone Solo
and installs hidapi into it,
so no system-wide pip install is needed.

--serve also hosts the site on 127.0.0.1:3000
so the page and the stream share an origin.
"""

import mimetypes
import os
import posixpath
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

mimetypes.add_type('text/javascript', '.js')
mimetypes.add_type('application/manifest+json', '.webmanifest')
mimetypes.add_type('image/svg+xml', '.svg')

VENV = os.path.expanduser('~/Library/Application Support/iPhone Solo/venv')
PYTHON = os.path.join(VENV, 'bin', 'python3')
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
LID_PORT = 8471
SITE_PORT = 3000
VENDOR = 0x05AC
PRODUCT = 0x8104
USAGE_PAGE = 0x20
USAGE = 0x8A
RATE = 1 / 60


def has_flag(name):
    return name in sys.argv


def arg_value(name, default):
    if name in sys.argv:
        return int(sys.argv[sys.argv.index(name) + 1])
    return default


# Dependency
def bootstrap():
    if not os.path.exists(PYTHON):
        print('Setting up a private Python environment…', flush=True)
        subprocess.check_call([sys.executable, '-m', 'venv', VENV])
    print('Installing hidapi…', flush=True)
    subprocess.check_call([PYTHON, '-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', 'hidapi'])
    os.execv(PYTHON, [PYTHON, *sys.argv])


try:
    import hid
except ImportError:
    if sys.executable == PYTHON:
        sys.exit('hidapi failed to install. Delete the venv and try again:\n  rm -r "%s"' % VENV)
    bootstrap()

SERVE = has_flag('--serve')
SITE = arg_value('--port', SITE_PORT if SERVE else LID_PORT)


# Sensor
def open_sensor():
    for info in hid.enumerate(VENDOR, PRODUCT):
        if info['usage_page'] == USAGE_PAGE and info['usage'] == USAGE:
            device = hid.device()
            device.open_path(info['path'])
            return device
    sys.exit('No lid angle sensor found. It ships in MacBooks from 2019 on.')


sensor = open_sensor()
sensor_lock = threading.Lock()


def read_angle():
    with sensor_lock:
        report = sensor.get_feature_report(1, 8)
    return report[1] | (report[2] << 8)


def stream_lid(handler):
    handler.send_response(200)
    handler.send_header('Content-Type', 'text/event-stream')
    handler.send_header('Cache-Control', 'no-cache')
    handler.cors()
    handler.end_headers()
    try:
        while True:
            handler.wfile.write(f'data: {read_angle()}\n\n'.encode())
            handler.wfile.flush()
            time.sleep(RATE)
    except (BrokenPipeError, ConnectionResetError):
        pass


# Server
def make_handler(allow_files):
    class Handler(BaseHTTPRequestHandler):
        def cors(self):
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Private-Network', 'true')

        def do_OPTIONS(self):
            self.send_response(204)
            self.cors()
            self.end_headers()

        def do_GET(self):
            path = urlparse(self.path).path
            if path == '/lid':
                stream_lid(self)
                return
            if not allow_files:
                self.send_error(404)
                return

            rel = 'index.html' if path in ('', '/') else posixpath.normpath(path.lstrip('/'))
            full = os.path.abspath(os.path.join(ROOT, rel))
            if not full.startswith(ROOT + os.sep) or not os.path.isfile(full):
                self.send_error(404)
                return

            mime, _ = mimetypes.guess_type(full)
            self.send_response(200)
            self.send_header('Content-Type', mime or 'application/octet-stream')
            self.cors()
            self.end_headers()
            with open(full, 'rb') as file:
                self.wfile.write(file.read())

        def log_message(self, *args):
            pass

    return Handler


def bind(port, allow_files):
    try:
        return ThreadingHTTPServer(('127.0.0.1', port), make_handler(allow_files))
    except OSError as error:
        return error


servers = []

if SERVE:
    site = bind(SITE, True)
    if isinstance(site, OSError):
        print(f'Could not host the site on {SITE}: {site}', flush=True)
    else:
        servers.append((site, f'http://127.0.0.1:{SITE}/'))
    if SITE != LID_PORT:
        lid = bind(LID_PORT, False)
        if isinstance(lid, OSError):
            print(f'Could not stream on {LID_PORT}: {lid}', flush=True)
        else:
            servers.append((lid, f'http://127.0.0.1:{LID_PORT}/lid'))
else:
    lid = bind(LID_PORT, False)
    if isinstance(lid, OSError):
        sys.exit(f'Could not stream on {LID_PORT}: {lid}')
    servers.append((lid, f'http://127.0.0.1:{LID_PORT}/lid'))

if not servers:
    sys.exit('No lid stream is listening.')

print(f'Lid at {read_angle()}°. ' + ' '.join(url for _, url in servers) + ' — press Ctrl+C to stop.', flush=True)

for httpd, _ in servers[1:]:
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

try:
    servers[0][0].serve_forever()
except KeyboardInterrupt:
    pass
