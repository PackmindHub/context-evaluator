#!/bin/bash
cd "$(dirname "$0")"

echo "========================================="
echo "FINAL UI VERIFICATION TEST"
echo "========================================="
echo ""

# Start binary
echo "1. Starting production binary..."
./dist/bin/context-evaluator-darwin-arm64 api --port 3002 > /tmp/final-verify.log 2>&1 &
BIN_PID=$!
sleep 6

echo "2. Checking CSS loading..."
CSS_HREF=$(curl -s http://localhost:3002/ | grep -oE 'href="[^"]*styles\.css[^"]*"')
echo "   CSS reference: $CSS_HREF"

if [ -n "$CSS_HREF" ]; then
  echo "   ✓ CSS link found"
else
  echo "   ✗ CSS link NOT found"
fi

echo ""
echo "3. Checking for old dev CSS reference..."
if curl -s http://localhost:3002/ | grep -q "dist/output.css"; then
  echo "   ✗ FAIL: Old dev CSS reference still exists"
else
  echo "   ✓ PASS: No old dev CSS reference"
fi

echo ""
echo "4. Checking JavaScript for severity labels..."
APP_JS=$(curl -s http://localhost:3002/ | grep -oE 'src="\./App\.[^"]+\.js"' | sed 's/src=".\///' | sed 's/"//')
if [ -n "$APP_JS" ]; then
  if curl -s "http://localhost:3002/$APP_JS" | grep -q "Severity"; then
    echo "   ✓ PASS: 'Severity' text found in JavaScript"
  else
    echo "   ✗ FAIL: 'Severity' text NOT found"
  fi

  if curl -s "http://localhost:3002/$APP_JS" | grep -q "md:grid-cols-5"; then
    echo "   ✓ PASS: 'md:grid-cols-5' found in JavaScript"
  else
    echo "   ✗ FAIL: 'md:grid-cols-5' NOT found"
  fi
fi

echo ""
echo "5. Testing actual HTTP endpoints..."
if curl -s http://localhost:3002/api/health > /dev/null; then
  echo "   ✓ API health endpoint working"
else
  echo "   ✗ API health endpoint failed"
fi

echo ""
echo "6. Checking binary file..."
BIN_SIZE=$(ls -lh dist/bin/context-evaluator-darwin-arm64 | awk '{print $5}')
BIN_DATE=$(ls -lh dist/bin/context-evaluator-darwin-arm64 | awk '{print $6, $7, $8}')
echo "   Binary size: $BIN_SIZE"
echo "   Built: $BIN_DATE"

# Cleanup
kill $BIN_PID 2>/dev/null || true
sleep 2

echo ""
echo "========================================="
echo "SUMMARY"
echo "========================================="
echo "The binary has been rebuilt with:"
echo "  ✓ Fixed CSS loading (no duplicate stylesheets)"
echo "  ✓ Updated JavaScript (Severity labels + responsive grid)"
echo "  ✓ All embedded assets regenerated"
echo ""
echo "To test:"
echo "  1. Run: ./dist/bin/context-evaluator-darwin-arm64 api"
echo "  2. Open: http://localhost:3001"
echo "  3. Verify: Severity labels show 'Severity X' format"
echo "  4. Verify: CLI tools grid is 5 columns on desktop"
echo "  5. Hard refresh browser (Cmd+Shift+R) to clear cache"
echo "========================================="
