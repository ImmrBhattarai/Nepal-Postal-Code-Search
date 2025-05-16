#!/bin/bash

# Build Docker image
docker build -t placefinder .

# Run container (remove existing if running)
docker rm -f placefinder-container 2>/dev/null || true

# Start container in detached mode, mapping port 8000
docker run -d --name placefinder-container -p 8000:8000 placefinder

echo "PlaceFinder running at http://localhost:8000"
