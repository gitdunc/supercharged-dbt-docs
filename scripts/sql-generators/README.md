# SQL Generators for dbt-docs Manifest & Catalog

## Overview

This directory contains SQL scripts to generate `manifest.json` and `catalog.json` files for **supercharged-dbt-docs** from multiple database systems.

### Available Generators

| Database | Status | File |
|----------|--------|------|
| **MySQL 8.0+** | ✅ Available | `mysql_manifest_generator.sql`, `mysql_catalog_generator.sql` |
| **SQL Server 2019+** | ✅ Reference | Original SQL Server script (legacy) |
| **PostgreSQL** | Coming soon | - |
| **Snowflake** | Coming soon | - |

---

## MySQL Generators (MySQL 8.0+)

### Prerequisites

- **MySQL 8.0+** with `json_*` functions enabled
- **READ-ONLY database user** (recommended for security)
- **INFORMATION_SCHEMA access** for schema introspection
- Sample database: **AdventureWorks** (or any database you want to analyze)

### Setup

#### 1. Create a Read-Only User

```sql
-- Create read-only user for manifest/catalog generation
CREATE USER 'dbt_analyzer'@'localhost' IDENTIFIED BY 'strong_password_here';

-- Grant minimal required privileges
GRANT SELECT ON INFORMATION_SCHEMA.* TO 'dbt_analyzer'@'localhost';
GRANT SELECT ON `adventureworks`.* TO 'dbt_analyzer'@'localhost';

-- Verify permissions
SHOW GRANTS FOR 'dbt_analyzer'@'localhost';
```

**Security Best Practice:** Use environment variables or a secrets manager (e.g., GitHub Secrets, HashiCorp Vault) to store credentials—never commit passwords to version control.

#### 2. Run the Manifest Generator

```bash
# Connect to MySQL and execute
mysql -h localhost -u dbt_analyzer -p adventureworks < mysql_manifest_generator.sql > manifest_output.json

# Or from Python/Node.js:
# Load the SQL file, execute it, extract the manifest_json column, and save to public/manifest.json
```

#### 3. Run the Catalog Generator

```bash
# Connect to MySQL and execute
mysql -h localhost -u dbt_analyzer -p adventureworks < mysql_catalog_generator.sql > catalog_output.json

# Or from Python/Node.js:
# Load the SQL file, execute it, extract the catalog_json column, and save to public/catalog.json
```

---

## Generator Details

### `mysql_manifest_generator.sql`

**Purpose:** Extract table schema, columns, relationships, and lineage.

**Output Structure:**
```json
{
  "metadata": { "dbt_schema_version": "...", "dbt_version": "1.0.0", ... },
  "nodes": {
    "model.schema.table_name": {
      "name": "table_name",
      "description": "...",
      "database": "adventureworks",
      "schema": "public",
      "resource_type": "table",
      "columns": { "col1": {...}, "col2": {...} },
      "depends_on": ["model.schema.parent_table"],
      "config": { "materialized": "table", "tags": ["auto-generated"] }
    }
  },
  "sources": {},
  "_childIndex": {}
}
```

**Features:**
- Extracts tables and views
- Builds relationships via foreign keys
- Generates depends-on lineage graph
- Auto-generates descriptions from database comments
- Compatible with dbt-docs manifest schema

### `mysql_catalog_generator.sql`

**Purpose:** Extract runtime statistics (row counts, storage, update times).

**Output Structure:**
```json
{
  "metadata": { "dbt_schema_version": "...", "generated_at": "2026-02-07..." },
  "nodes": {
    "model.schema.table_name": {
      "metadata": {
        "schema": "public",
        "name": "table_name",
        "type": "base table",
        "owner": "schema_owner",
        "comment": "..."
      },
      "stats": {
        "num_rows": { "value": 123456, ... },
        "num_bytes": { "value": 45.67, ... },
        "last_changed": { "value": "2026-02-07 14:30:00", ... }
      },
      "columns": { "col1": {...}, "col2": {...} }
    }
  },
  "sources": {},
  "errors": {}
}
```

**Features:**
- Table row counts (from INFORMATION_SCHEMA statistics)
- Storage size (data + index in MB)
- Last updated timestamps
- Column-level metadata
- Compatible with dbt-docs catalog schema

---

## Security Best Practices

### ✅ DO

- **Use read-only database users:** Create a dedicated user with SELECT-only permissions
- **Store credentials securely:** Use environment variables, secrets managers, or secure vaults
- **Limit network access:** Use database firewalls and restrict connections by IP
- **Audit SQL execution:** Log all manifest/catalog generation runs
- **Sanitize output:** Review generated JSON for any accidental sensitive data
- **Use TLS connections:** Add `--ssl-mode=REQUIRED` when connecting over networks
- **Version control only the JSON:** Never commit SQL files containing credentials

### ❌ DON'T

- **Hardcode passwords** in SQL files or scripts
- **Grant full database permissions** to the analysis user
- **Run on production databases** without approval and monitoring
- **Expose JSON files** publicly—keep them inside your application directory
- **Commit credentials** to version control under any circumstances
- **Use default/empty passwords** for database users
- **Share database connections** across untrusted applications

---

## Integration with supercharged-dbt-docs

### Node.js / TypeScript Example

```typescript
import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
import * as path from 'path';

async function generateManifestAndCatalog() {
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbUser = process.env.DB_USER; // From environment variables
  const dbPassword = process.env.DB_PASSWORD;
  const dbName = process.env.DB_NAME;

  // Run manifest generator
  const manifestProcess = spawn('mysql', [
    `-h${dbHost}`,
    `-u${dbUser}`,
    `-p${dbPassword}`,
    dbName,
  ]);

  let manifestOutput = '';
  manifestProcess.stdout.on('data', (data) => {
    manifestOutput += data.toString();
  });

  await new Promise((resolve, reject) => {
    manifestProcess.on('close', (code) => {
      if (code !== 0) reject(new Error(`MySQL error: ${code}`));
      resolve(null);
    });
    manifestProcess.stdin.write(manifestGeneratorSQL);
    manifestProcess.stdin.end();
  });

  // Parse JSON and save
  const manifestJSON = JSON.parse(manifestOutput);
  writeFileSync(
    path.join(process.cwd(), 'public', 'manifest.json'),
    JSON.stringify(manifestJSON, null, 2)
  );

  console.log('✅ Manifest generated: public/manifest.json');
}
```

### Python Example

```python
import json
import os
import subprocess
from pathlib import Path

def generate_manifest_and_catalog():
    db_host = os.getenv('DB_HOST', 'localhost')
    db_user = os.getenv('DB_USER')
    db_password = os.getenv('DB_PASSWORD')
    db_name = os.getenv('DB_NAME')
    
    # Read SQL file
    manifest_sql = Path('scripts/sql-generators/mysql_manifest_generator.sql').read_text()
    
    # Execute via mysql command
    cmd = f"""mysql -h {db_host} -u {db_user} -p{db_password} {db_name} -e "{manifest_sql}" """
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    
    if result.returncode != 0:
        raise RuntimeError(f"MySQL error: {result.stderr}")
    
    # Parse and save
    manifest_json = json.loads(result.stdout)
    output_path = Path('public/manifest.json')
    output_path.write_text(json.dumps(manifest_json, indent=2))
    
    print("✅ Manifest generated: public/manifest.json")

if __name__ == '__main__':
    generate_manifest_and_catalog()
```

---

## Automation & CI/CD

### GitHub Actions Example

```yaml
name: Generate dbt-docs Manifest & Catalog

on:
  schedule:
    # Run daily at 2 AM UTC
    - cron: '0 2 * * *'
  workflow_dispatch:

jobs:
  generate:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Install MySQL client
        run: sudo apt-get update && sudo apt-get install -y mysql-client
      
      - name: Generate manifest.json
        env:
          DB_HOST: ${{ secrets.DB_HOST }}
          DB_USER: ${{ secrets.DB_USER }}
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
          DB_NAME: ${{ secrets.DB_NAME }}
        run: |
          mysql -h $DB_HOST -u $DB_USER -p$DB_PASSWORD $DB_NAME \
            < scripts/sql-generators/mysql_manifest_generator.sql > manifest.json
          mv manifest.json public/
      
      - name: Generate catalog.json
        env:
          DB_HOST: ${{ secrets.DB_HOST }}
          DB_USER: ${{ secrets.DB_USER }}
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
          DB_NAME: ${{ secrets.DB_NAME }}
        run: |
          mysql -h $DB_HOST -u $DB_USER -p$DB_PASSWORD $DB_NAME \
            < scripts/sql-generators/mysql_catalog_generator.sql > catalog.json
          mv catalog.json public/
      
      - name: Commit and Push
        run: |
          git config user.name "dbt-docs-bot"
          git config user.email "bot@dbt-docs.local"
          git add public/manifest.json public/catalog.json
          git commit -m "chore: update manifest and catalog"
          git push
```

---

## Testing & Validation

### Validate Manifest Output

```sql
-- Check if all tables were extracted
SELECT COUNT(*) AS table_count 
FROM JSON_TABLE(
  (SELECT manifest_json FROM /* your execution */),
  '$.nodes.*' COLUMNS (name VARCHAR(255) PATH '$.name')
) jt;

-- Check relationships were detected
SELECT COUNT(*) AS relationship_count
FROM JSON_TABLE(
  (SELECT manifest_json FROM /* your execution */),
  '$.nodes.*.depends_on[*]' COLUMNS (dep VARCHAR(255) PATH '$')
) jt;
```

### Sample Database Setup

```sql
-- Create adventure works sample if not present
-- MySQL AdventureWorks is available at:
-- https://github.com/Microsoft/sql-server-samples

-- Alternatively, create a minimal test schema:
CREATE DATABASE test_dbt_docs;
USE test_dbt_docs;

CREATE TABLE customers (
  customer_id INT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  order_id INT PRIMARY KEY,
  customer_id INT NOT NULL,
  order_date DATE,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- Generate manifest and verify
```

---

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "Access denied for user" | Insufficient permissions | Verify user has SELECT on INFORMATION_SCHEMA |
| "Unknown column in field list" | MySQL version too old | Upgrade to MySQL 8.0+ for JSON functions |
| "Approximate row counts" | InnoDB statistics disabled | Enable `innodb_stats_auto_recalc` |
| "Missing foreign key relationships" | Constraints not defined | Verify tables use `FOREIGN KEY` definitions |
| "JSON output too large" | Very large schemas | Consider filtering by schema in the SQL |

---

## Contributing

Before adding new generators:

1. **Review for security:** Ensure no credentials or PII extraction
2. **Test with sample data:** Use public databases (AdventureWorks, Sakila, etc.)
3. **Document the output schema:** Provide sample JSON
4. **Add error handling:** Gracefully fail on permission errors
5. **Include setup instructions:** Make it easy for users to replicate

---

## License

Public Domain — Free to use and modify without restrictions.

---

## References

- [dbt Manifest Schema](https://schemas.getdbt.com/dbt/manifest/v9.json)
- [dbt Catalog Schema](https://schemas.getdbt.com/dbt/catalog/v1.json)
- [MySQL INFORMATION_SCHEMA](https://dev.mysql.com/doc/refman/8.0/en/information-schema.html)
- [MySQL JSON Functions](https://dev.mysql.com/doc/refman/8.0/en/json-functions.html)
- [AdventureWorks Sample Database](https://learn.microsoft.com/en-us/sql/samples/adventureworks-install-configure)

---

**Generated:** February 7, 2026  
**Author:** Public Domain Contributors
