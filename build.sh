#!/bin/bash
set -e

echo "Installing backend dependencies..."
cd backend && npm install --production

echo "Installing frontend dependencies (including dev)..."
cd ../frontend && npm install --include=dev && npm run build

echo "Build complete!"
