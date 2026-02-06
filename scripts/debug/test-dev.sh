#!/bin/bash

cd "$(dirname "$0")"

echo "Testing API server..."
bun --hot src/index.ts api > /tmp/api-server.log 2>&1 &
API_PID=$!

sleep 5

if curl -s http://localhost:3001/api/health > /dev/null; then
    echo "✓ API server is running on port 3001"
else
    echo "✗ API server failed to start"
    cat /tmp/api-server.log
fi

kill $API_PID 2>/dev/null || true

echo ""
echo "Testing frontend server..."
(cd frontend && bun run css:build) > /dev/null 2>&1
bun --hot frontend/server.ts > /tmp/frontend-server.log 2>&1 &
FRONTEND_PID=$!

sleep 5

if curl -s http://localhost:3000/ > /dev/null; then
    echo "✓ Frontend server is running on port 3000"
else
    echo "✗ Frontend server failed to start"
    cat /tmp/frontend-server.log
fi

kill $FRONTEND_PID 2>/dev/null || true

echo ""
echo "Testing both servers together..."
bun run generate:version > /dev/null 2>&1
(cd frontend && bun run css:build) > /dev/null 2>&1
bun --hot src/index.ts api > /tmp/both-api.log 2>&1 &
API_PID=$!
bun --hot frontend/server.ts > /tmp/both-frontend.log 2>&1 &
FRONTEND_PID=$!

sleep 5

if curl -s http://localhost:3001/api/health > /dev/null && curl -s http://localhost:3000/ > /dev/null; then
    echo "✓ Both servers are running successfully"
else
    echo "✗ One or both servers failed"
    echo "API log:"
    cat /tmp/both-api.log | head -20
    echo "Frontend log:"
    cat /tmp/both-frontend.log | head -20
fi

kill $API_PID $FRONTEND_PID 2>/dev/null || true
