#!/bin/bash
  set -e

  # Update TagLib to a new version
  # Usage: ./scripts/update-taglib.sh v2.2

  NEW_VERSION=${1:-"v2.1"}

  echo "🔄 Updating TagLib to $NEW_VERSION..."

  # Pull the new version using git subtree
  git subtree pull --prefix=lib/taglib https://github.com/taglib/taglib.git $NEW_VERSION --squash -m "Update TagLib to $NEW_VERSION"

  echo "✅ TagLib updated to $NEW_VERSION"
  echo "📝 Please review changes and test the build:"
  echo "   npm run build"
  echo "   npm test"