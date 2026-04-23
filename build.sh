#!/bin/bash
set -e

echo "Installing backend dependencies..."
cd backend && npm install

echo "Installing frontend dependencies and building..."
cd ../frontend && npm install && npm run build

echo "Build complete!"
