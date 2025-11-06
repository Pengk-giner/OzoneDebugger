from flask import Flask, render_template, send_from_directory
import os, sys

app = Flask(__name__)

def get_docs_dir():
    # Handle both development and frozen (PyInstaller) modes
    if getattr(sys, 'frozen', False):
        base_path = sys._MEIPASS  # PyInstaller's temp folder
    else:
        base_path = os.path.abspath(os.path.join(app.root_path, '..'))
    return os.path.join(base_path, 'docs')

# Serve the project-level docs/index.html (not the templates/index.html)
# Path relative to this file: ../docs/index.html
@app.route('/')
def main_route():
    docs_dir = get_docs_dir()
    # Use send_from_directory so Flask serves the static file directly
    return send_from_directory(docs_dir, 'index.html')


# Serve stylesheet and JS referenced by docs/index.html (they are relative paths
# in that file, e.g. "styles.css" and "app.js"). These routes map those
# requests to the ../docs directory so assets load correctly without changing
# the HTML.
@app.route('/styles.css')
def docs_styles():
    docs_dir = get_docs_dir()
    return send_from_directory(docs_dir, 'styles.css')


@app.route('/app.js')
def docs_appjs():
    docs_dir = get_docs_dir()
    return send_from_directory(docs_dir, 'app.js')


@app.route('/assets/<path:filename>')
def docs_assets(filename):
    docs_dir = get_docs_dir()
    docs_assets_dir = os.path.abspath(os.path.join(docs_dir, 'assets'))
    return send_from_directory(docs_assets_dir, filename)


if __name__ == '__main__':
    app.run(
        host='0.0.0.0',
        ssl_context='adhoc')
