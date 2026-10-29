#!/usr/bin/env bash
set -euo pipefail
node tools/generate-client.cjs
python3 - <<'PY'
import json, subprocess, selectors, pathlib
request=pathlib.Path('.local/client-request.json').read_bytes()
child=subprocess.Popen(['node',str(pathlib.Path('node_modules/@prisma/client/generator-build/index.js').resolve())],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
try:
    child.stdin.write(request); child.stdin.flush()
    selector=selectors.DefaultSelector(); selector.register(child.stderr,selectors.EVENT_READ)
    if not selector.select(timeout=30): raise RuntimeError('Prisma generator timed out')
    response=json.loads(child.stderr.readline())
    if response.get('id')!=1 or 'error' in response: raise RuntimeError('Prisma generator RPC failed')
    if not pathlib.Path('node_modules/.prisma/client/schema.prisma').exists(): raise RuntimeError('Generated client missing')
    print('Prisma JavaScript engine client generated.')
finally:
    child.stdin.close(); child.terminate(); child.wait(timeout=10)
    pathlib.Path('.local/client-request.json').unlink(missing_ok=True)
PY
