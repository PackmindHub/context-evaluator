#!/bin/bash
cd "$(dirname "$0")"

echo "Checking grid layout in binary JavaScript..."
./dist/bin/context-evaluator-darwin-arm64 api --port 3002 > /tmp/grid-check.log 2>&1 &
BIN_PID=$!

sleep 5

echo "Grid classes found in App.js:"
curl -s http://localhost:3002/App.kvkw7h1d.js | grep -o "grid-cols-[0-9md:-]*" | sort -u

echo ""
echo "Checking for md:grid-cols-5:"
if curl -s http://localhost:3002/App.kvkw7h1d.js | grep -q "md:grid-cols-5"; then
  echo "✓ Found md:grid-cols-5 (5-column responsive grid)"
else
  echo "✗ NOT FOUND - binary has old code"
fi

kill $BIN_PID 2>/dev/null || true
