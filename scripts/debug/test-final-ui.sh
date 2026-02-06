#!/bin/bash
cd "$(dirname "$0")"

echo "=== Testing Binary UI After Full Rebuild ==="
./dist/bin/context-evaluator-darwin-arm64 api --port 3002 > /tmp/final-ui-test.log 2>&1 &
BINARY_PID=$!

sleep 5

echo "1. CSS Links:"
curl -s http://localhost:3002/ | grep -oE 'rel="stylesheet".*href="[^"]*"'

echo ""
echo "2. JavaScript Bundle:"
curl -s http://localhost:3002/ | grep -oE 'script.*src="[^"]*"'

echo ""
echo "3. Checking embedded JS size:"
APPJS=$(curl -s http://localhost:3002/ | grep -oE 'src="\./App\.[^"]+\.js"' | sed 's/src=".\///' | sed 's/"//')
if [ -n "$APPJS" ]; then
  JS_SIZE=$(curl -s "http://localhost:3002/$APPJS" | wc -c | tr -d ' ')
  echo "  App.js size: $JS_SIZE bytes"

  echo ""
  echo "4. Checking for 'Severity' text in JS bundle:"
  if curl -s "http://localhost:3002/$APPJS" | grep -q "Severity"; then
    echo "  ✓ Found 'Severity' in JavaScript (correct code)"
  else
    echo "  ❌ No 'Severity' found (old code?)"
  fi
else
  echo "  ❌ Could not find App.js reference"
fi

kill $BINARY_PID 2>/dev/null || true

echo ""
echo "=== Comparing with Dev Mode ==="
echo "Starting dev frontend..."
(cd frontend && bun run css:build > /dev/null 2>&1)
bun --hot frontend/server.ts > /tmp/dev-frontend-test.log 2>&1 &
DEV_PID=$!

sleep 5

echo "Dev mode JavaScript:"
curl -s http://localhost:3000/ | grep -oE 'script.*src="[^"]*"'

kill $DEV_PID 2>/dev/null || true

echo ""
echo "=== Test Complete ==="
