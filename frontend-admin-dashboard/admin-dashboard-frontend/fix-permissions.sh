#!/bin/bash
# Remove extended attributes from node_modules
echo "Removing extended attributes from node_modules..."
xattr -rc node_modules 2>/dev/null || echo "Note: Some files may not have extended attributes"

# Fix permissions
echo "Fixing permissions..."
chmod -R u+w node_modules 2>/dev/null || echo "Note: Some permission fixes may require sudo"

echo "Done! Try running 'npm start' again."
