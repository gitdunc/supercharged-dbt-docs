#!/bin/bash
# -*- coding: utf-8 -*-
#
# quick-start-mysql.sh
# Quick-start helper script for generating manifest and catalog JSON from MySQL
#
# USAGE:
#   bash quick-start-mysql.sh
#
# This script guides you through:
# 1. Creating a read-only database user
# 2. Running manifest generator
# 3. Running catalog generator
# 4. Validating output files
#
# REQUIREMENTS:
#   - bash, mysql client, jq (optional, for JSON validation)
#   - MySQL 8.0+ server access

set -o errexit
set -o pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}   Supercharged dbt-docs: MySQL Quick-Start${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}\n"

# ============================================================================
# Step 1: Gather Configuration
# ============================================================================

echo -e "${YELLOW}Step 1: Configure Database Connection${NC}\n"

read -p "MySQL Host [localhost]: " DB_HOST
DB_HOST=${DB_HOST:-localhost}

read -p "MySQL Port [3306]: " DB_PORT
DB_PORT=${DB_PORT:-3306}

read -p "MySQL Database Name [adventureworks]: " DB_NAME
DB_NAME=${DB_NAME:-adventureworks}

read -p "MySQL Root User [root]: " MYSQL_ROOT_USER
MYSQL_ROOT_USER=${MYSQL_ROOT_USER:-root}

read -sp "MySQL Root Password: " MYSQL_ROOT_PASSWORD
echo ""

# Test connection
echo -e "\n${YELLOW}Testing MySQL connection...${NC}"
if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$MYSQL_ROOT_USER" -p"$MYSQL_ROOT_PASSWORD" -e "SELECT 1;" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Connection successful${NC}\n"
else
  echo -e "${RED}❌ Connection failed. Check credentials and try again.${NC}"
  exit 1
fi

# ============================================================================
# Step 2: Create Read-Only User (Optional)
# ============================================================================

echo -e "${YELLOW}Step 2: Create Read-Only Database User${NC}\n"

read -p "Create new read-only user 'dbt_analyzer'? [y/N]: " CREATE_USER
if [[ "$CREATE_USER" =~ ^[Yy]$ ]]; then
  read -sp "Enter password for 'dbt_analyzer': " DBA_PASSWORD
  echo ""
  
  mysql -h "$DB_HOST" -P "$DB_PORT" -u "$MYSQL_ROOT_USER" -p"$MYSQL_ROOT_PASSWORD" <<EOF
CREATE USER IF NOT EXISTS 'dbt_analyzer'@'%' IDENTIFIED BY '$DBA_PASSWORD';
GRANT SELECT ON INFORMATION_SCHEMA.* TO 'dbt_analyzer'@'%';
GRANT SELECT ON \`$DB_NAME\`.* TO 'dbt_analyzer'@'%';
FLUSH PRIVILEGES;
EOF
  
  echo -e "${GREEN}✅ User created: dbt_analyzer${NC}\n"
  
  # Update connection user
  DB_USER="dbt_analyzer"
  DB_PASSWORD="$DBA_PASSWORD"
else
  read -p "Existing MySQL User: " DB_USER
  read -sp "Password for $DB_USER: " DB_PASSWORD
  echo ""
fi

# ============================================================================
# Step 3: Generate Manifest JSON
# ============================================================================

echo -e "\n${YELLOW}Step 3: Generating manifest.json${NC}\n"

MANIFEST_OUTPUT="manifest.json"

# Check if SQL file exists
if [ ! -f "mysql_manifest_generator.sql" ]; then
  echo -e "${RED}❌ Error: mysql_manifest_generator.sql not found${NC}"
  echo "   Make sure you're in the scripts/sql-generators directory"
  exit 1
fi

echo "Executing MySQL query..."
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < mysql_manifest_generator.sql > manifest_raw.json 2>/dev/null

if [ -s manifest_raw.json ]; then
  # Extract the JSON column from the query result
  # The output is a tab-separated value with the JSON as the first field
  jq '.' manifest_raw.json 2>/dev/null | head -c 1000 > "$MANIFEST_OUTPUT" || cat manifest_raw.json | tail -1 > "$MANIFEST_OUTPUT"
  
  echo -e "${GREEN}✅ Manifest generated: $MANIFEST_OUTPUT${NC}"
  
  # Validate JSON
  if command -v jq &> /dev/null; then
    if jq empty "$MANIFEST_OUTPUT" 2>/dev/null; then
      echo -e "${GREEN}✅ JSON validation passed${NC}"
      NODE_COUNT=$(jq '.nodes | length' "$MANIFEST_OUTPUT" 2>/dev/null || echo "?")
      echo -e "   Extracted ${GREEN}$NODE_COUNT${NC} nodes\n"
    else
      echo -e "${YELLOW}⚠️  JSON validation failed - manual review needed${NC}\n"
    fi
  fi
  
  rm -f manifest_raw.json
else
  echo -e "${RED}❌ Failed to generate manifest${NC}"
  exit 1
fi

# ============================================================================
# Step 4: Generate Catalog JSON
# ============================================================================

echo -e "${YELLOW}Step 4: Generating catalog.json${NC}\n"

CATALOG_OUTPUT="catalog.json"

if [ ! -f "mysql_catalog_generator.sql" ]; then
  echo -e "${RED}❌ Error: mysql_catalog_generator.sql not found${NC}"
  exit 1
fi

echo "Executing MySQL query..."
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < mysql_catalog_generator.sql > catalog_raw.json 2>/dev/null

if [ -s catalog_raw.json ]; then
  jq '.' catalog_raw.json 2>/dev/null | head -c 1000 > "$CATALOG_OUTPUT" || cat catalog_raw.json | tail -1 > "$CATALOG_OUTPUT"
  
  echo -e "${GREEN}✅ Catalog generated: $CATALOG_OUTPUT${NC}"
  
  if command -v jq &> /dev/null; then
    if jq empty "$CATALOG_OUTPUT" 2>/dev/null; then
      echo -e "${GREEN}✅ JSON validation passed${NC}"
      NODE_COUNT=$(jq '.nodes | length' "$CATALOG_OUTPUT" 2>/dev/null || echo "?")
      echo -e "   Extracted ${GREEN}$NODE_COUNT${NC} nodes\n"
    else
      echo -e "${YELLOW}⚠️  JSON validation failed - manual review needed${NC}\n"
    fi
  fi
  
  rm -f catalog_raw.json
else
  echo -e "${RED}❌ Failed to generate catalog${NC}"
  exit 1
fi

# ============================================================================
# Step 5: Copy to Application
# ============================================================================

echo -e "${YELLOW}Step 5: Install JSON Files${NC}\n"

read -p "Copy JSON files to ../../../public/? [y/N]: " COPY_FILES
if [[ "$COPY_FILES" =~ ^[Yy]$ ]]; then
  TARGET_DIR="../../../public"
  
  if [ -d "$TARGET_DIR" ]; then
    cp "$MANIFEST_OUTPUT" "$TARGET_DIR/"
    cp "$CATALOG_OUTPUT" "$TARGET_DIR/"
    echo -e "${GREEN}✅ Files copied to $TARGET_DIR${NC}\n"
  else
    echo -e "${YELLOW}⚠️  Directory $TARGET_DIR not found${NC}"
    echo -e "   Manual copy: cp $MANIFEST_OUTPUT $CATALOG_OUTPUT to your public directory\n"
  fi
fi

# ============================================================================
# Summary
# ============================================================================

echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}   ✅ Setup Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}\n"

echo "Next steps:"
echo "1. Review the generated JSON files for accuracy"
echo "2. Restart your application (or redeploy if using auto-discovery)"
echo "3. Visit http://localhost:3000 to see the documentation"
echo ""
echo "For full documentation, see: README.md"
echo "For security best practices, see: SECURITY_REVIEW.md"
echo ""
