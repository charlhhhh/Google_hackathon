#!/bin/bash
#
# Google Cloud Hackathon - Setup Script
#
# This script connects you to the Google Cloud Hackathon network
# and reserves your explorer identity.
#
# Run from project root: ./scripts/setup.sh
#

set -e

# Determine project root (parent of scripts directory)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# =============================================================================
# Step -1: Cleanup Old Experiments
# =============================================================================
if command -v uv &> /dev/null; then
    echo "Clearing uv cache..."
    uv cache clean
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color


# Print banner
echo ""
echo -e "${CYAN}🚀 Welcome to Google Cloud Hackathon!${NC}"
echo ""

# =============================================================================
# Step 0: Check Google Cloud Authentication
# =============================================================================
echo "Checking Google Cloud authentication..."

if ! gcloud auth print-access-token > /dev/null 2>&1; then
    echo -e "${RED}Error: Not authenticated with Google Cloud.${NC}"
    echo "Please run: gcloud auth login"
    exit 1
fi

echo -e "${GREEN}✓ Authenticated${NC}"

# =============================================================================
# Step 1: Find or Create Google Cloud Project
# =============================================================================
PROJECT_FILE="$HOME/project_id.txt"
PROJECT_ID=""
CODELAB_PROJECT_PREFIX="gcloud-hackathon"

# 1a. Create a new Google Cloud Project
# Delete existing project file to ensure a clean state for a new project
rm -f "$PROJECT_FILE"

echo ""
echo -e "${YELLOW}Creating a new project for this hackathon...${NC}"
PREFIX_LEN=${#CODELAB_PROJECT_PREFIX}
MAX_SUFFIX_LEN=$(( 30 - PREFIX_LEN - 1 ))

# Loop until a project is successfully created (handles name collisions)
while true; do
    RANDOM_SUFFIX=$(LC_ALL=C tr -dc 'a-z0-9' < /dev/urandom | head -c "$MAX_SUFFIX_LEN")
    PROJECT_ID="${CODELAB_PROJECT_PREFIX}-${RANDOM_SUFFIX}"

    echo -e "Attempting to create project: ${CYAN}${PROJECT_ID}${NC}"

    if gcloud projects create "$PROJECT_ID" --labels=environment=development --quiet; then
        echo -e "${GREEN}✓ Successfully created project '$PROJECT_ID'.${NC}"
        break
    else
        echo -e "${RED}Project ID '$PROJECT_ID' may already exist or creation failed. Retrying with a new ID...${NC}"
        sleep 1
    fi
done

gcloud config set project "$PROJECT_ID" --quiet || {
    echo -e "${RED}Failed to set active project.${NC}"
    exit 1
}

# Save project ID for reuse across levels
echo "$PROJECT_ID" > "$PROJECT_FILE"
echo -e "Using project: ${CYAN}${PROJECT_ID}${NC}"

# =============================================================================
# Step 2: Check and Enable Billing (NEW!)
# =============================================================================
echo ""
echo -e "${YELLOW}Checking billing configuration...${NC}"

# Pre-install billing library (needed by billing-enablement.py)
pip install --quiet --user google-cloud-billing 2>/dev/null || true

# Run the billing enablement script
if ! python3 "${SCRIPT_DIR}/billing-enablement.py"; then
    echo ""
    echo -e "${RED}Billing setup incomplete. Please configure billing and try again.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Setup complete! Ready to proceed with the codelab instructions.${NC}"
