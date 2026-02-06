#!/bin/bash
cd "$(dirname "$0")"

echo "=== Testing Production Binary UI ==="
./dist/bin/context-evaluator-darwin-arm64 api --port 3002 > /tmp/verify-binary.log 2>&1 &
BINARY_PID=$!

sleep 5

echo "1. CSS references in HTML:"
curl -s http://localhost:3002/ | grep -oE 'href="[^"]*\.css[^"]*"' || echo "  None found"

echo ""
echo "2. Checking if styles.css loads correctly:"
STYLES_SIZE=$(curl -s http://localhost:3002/styles.css | wc -c | tr -d ' ')
echo "  styles.css size: $STYLES_SIZE bytes"

echo ""
echo "3. Checking if dev CSS reference is gone:"
if curl -s http://localhost:3002/ | grep -q "dist/output.css"; then
  echo "  ❌ FAIL: dist/output.css reference still exists"
else
  echo "  ✓ PASS: No dist/output.css reference"
fi

echo ""
echo "4. Checking for duplicate CSS links:"
CSS_COUNT=$(curl -s http://localhost:3002/ | grep -c "stylesheet")
echo "  Stylesheet links found: $CSS_COUNT"
if [ "$CSS_COUNT" -gt 1 ]; then
  echo "  ⚠️  WARNING: Multiple stylesheet links detected"
fi

kill $BINARY_PID 2>/dev/null || true

echo ""
echo "=== Test Complete ==="
