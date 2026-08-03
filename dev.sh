#!/bin/bash
export PATH="/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")"
exec node node_modules/.bin/next dev
