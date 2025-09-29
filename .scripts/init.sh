#!/bin/sh

# Check if Homebrew is installed
if ! command -v brew /dev/null 2>&1; then
  echo "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Check if Ahoy is installed
if ! command -v ahoy /dev/null 2>&1; then
  echo "Installing Ahoy..."
  brew install ahoy
fi

# Check if Gum is installed
if ! command -v gum /dev/null 2>&1; then
  echo "Installing Gum..."
  brew install gum
fi

# Check if Act is installed
if ! command -v act /dev/null 2>&1; then
  echo "Installing Act..."
  brew install act
fi

echo "Repository Initialized!"