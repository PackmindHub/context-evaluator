#!/bin/bash
cd "$(dirname "$0")"

echo "Starting production binary..."
./dist/bin/context-evaluator-darwin-arm64 api --port 3002 > /tmp/binary-ui-test.log 2>&1 &
BINARY_PID=$!

sleep 5

echo "Checking which CSS the binary serves..."
curl -s http://localhost:3002/ | grep -oE 'href="[^"]*\.css"'

echo ""
echo "Fetching styles.css from binary..."
curl -s http://localhost:3002/styles.css | wc -c

echo ""
echo "Checking if custom classes are present..."
curl -s http://localhost:3002/styles.css | grep -o "severity-badge\|info-section\|stat-card" | sort -u

kill $BINARY_PID 2>/dev/null || true
