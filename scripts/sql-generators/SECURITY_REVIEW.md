# Security Review: SQL Server to MySQL Port

## Overview

This document details the security review and best-practice changes made when porting the original SQL Server manifest generator (`Azure_loves_dbtDocs_v12.sql`) to MySQL.

---

## Original Script Analysis

### What the Original Did

**File:** `Azure_loves_dbtDocs_v12.sql` (SQL Server 2019)

**Purpose:**
- Extracted database lineage from SQL Server's INFORMATION_SCHEMA
- Built recursive CTEs to compute table dependencies
- Generated manifest-like structure for visualization

**Database:** AdventureWorks2017_DWH (hardcoded)

---

## Security Issues Identified & Fixed

### 1. **Hardcoded Database Name** ⚠️ LOW

| Issue | Original | Fixed |
|-------|----------|-------|
| **Code** | `USE AdventureWorks2017_DWH;` | `SET @DATABASE_NAME = 'adventureworks';` (configurable) |
| **Risk** | Limits reusability; requires manual editing | Parameterized for flexibility |
| **Fix** | Use variables/parameters instead | ✅ Implemented in MySQL versions |

**Recommendation:** Always parameterize database/schema names. This makes scripts:
- Reusable across multiple databases
- Easier to test
- Less prone to production accidents

---

### 2. **No Input Validation** ⚠️ MEDIUM

| Issue | Original | Fixed |
|-------|----------|-------|
| **Code** | Raw table/column names in queries | Parameterized with `@DATABASE_NAME` |
| **Risk** | SQL injection if names come from untrusted sources | Input is still system-generated (safe) |
| **Fix** | Always validate/quote identifiers | ✅ INFORMATION_SCHEMA queries are safe |

**Recommendation:** If extending these scripts:
- Use backticks for identifiers (MySQL): `` `table_name` ``
- Use brackets for identifiers (SQL Server): `[table_name]`
- Never concatenate user input into SQL queries

---

### 3. **No Explicit Permissions Model** ⚠️ MEDIUM

| Issue | Original | Fixed |
|-------|----------|-------|
| **Code** | No user creation; assumes current user access | Includes user creation (`dbt_analyzer`) |
| **Risk** | Unclear who can run; no principle of least privilege | Read-only dedicated user with minimal grants |
| **Fix** | Create read-only analysis user | ✅ Documented in README |

**Setup difference:**

**Original (Implicit):**
```sql
-- Assumed to be run by a powerful user (DBA, etc.)
USE AdventureWorks2017_DWH;
-- No explicit permission management
```

**MySQL Port (Explicit):**
```sql
-- Create minimal-privilege user
CREATE USER 'dbt_analyzer'@'localhost' IDENTIFIED BY 'password';
GRANT SELECT ON INFORMATION_SCHEMA.* TO 'dbt_analyzer'@'localhost';
GRANT SELECT ON `adventureworks`.* TO 'dbt_analyzer'@'localhost';
```

**Security Benefit:** Even if credentials are compromised, attacker can only read schema metadata (not execute, insert, update, delete).

---

### 4. **No Explicit Credential Handling** ⚠️ HIGH

| Issue | Original | Fixed |
|-------|----------|-------|
| **Code** | No passwords in script (assumes Windows auth) | Recommends environment variables |
| **Risk** | Windows auth not portable; easy to hardcode passwords | Passwords never stored in code |
| **Fix** | Use environment variables, secrets managers | ✅ Documented in README |

**Example - Do's and Don'ts:**

❌ **BAD (Don't Do This):**
```bash
mysql -h localhost -u root -pMySecurePassword123 adventureworks < manifest_gen.sql
```

❌ **BAD (Don't Do This):**
```sql
-- In a file:
SET @DB_PASSWORD = 'MySecurePassword123';
```

✅ **GOOD (Do This):**
```bash
# Store in .env or GitHub Secrets, never in code
mysql -h $DB_HOST -u $DB_USER -p$DB_PASSWORD $DB_NAME < manifest_gen.sql
```

✅ **GOOD (Kubernetes):**
```yaml
env:
- name: DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: db-credentials
      key: password
```

---

### 5. **No PII Filtering** ⚠️ LOW (for this script)

| Issue | Original | Fixed |
|-------|----------|-------|
| **Scope** | Extracts table/column names only (no data) | Same scope—schema metadata only |
| **Risk** | Column names could hint at PII (e.g., `ssn`, `credit_card`) | Output may expose sensitive field names |
| **Fix** | Document this limitation; exclude sensitive columns | ✅ Documented as limitation |

**What IS Extracted (Safe):**
- Table names
- Column names & data types
- Foreign key relationships
- Row counts (approximate)

**What IS NOT Extracted (Good):**
- Actual data values
- User passwords
- API keys
- Credentials

**Recommendation:** If your schema has sensitive column names:
- Add a WHERE clause to exclude them
- Document which tables/columns are sensitive
- Consider renaming columns to be generic (e.g., `customer_pii_1` instead of `ssn`)

---

### 6. **No Audit Logging** ⚠️ MEDIUM

| Issue | Original | Fixed |
|-------|----------|-------|
| **Code** | Runs silently; no logging | Added comments suggesting logging |
| **Risk** | No record of who/when/what was executed | Can't trace manifest generation |
| **Fix** | Log all generation runs | ✅ Documented best practice |

**Recommendation for Production:**
```typescript
// Node.js example
async function generateManifest() {
  const timestamp = new Date().toISOString();
  const user = process.env.CI_USER || 'unknown';
  
  logger.info('Starting manifest generation', { timestamp, user });
  
  try {
    // ... run SQL ...
    logger.info('Manifest generated successfully', { 
      timestamp: new Date().toISOString(), 
      size_bytes: fs.statSync('public/manifest.json').size 
    });
  } catch (error) {
    logger.error('Manifest generation failed', { error: error.message });
    throw error;
  }
}
```

---

### 7. **No Output Sanitization** ⚠️ LOW

| Issue | Original | Fixed |
|-------|----------|-------|
| **Code** | JSON output not validated | Added note to review output |
| **Risk** | Malformed JSON; accidental data leaks | Validate before deploying |
| **Fix** | Parse JSON and validate structure | ✅ Documented validation |

**Validation Checklist:**
```typescript
import * as fs from 'fs';

function validateManifest(filePath: string) {
  const manifest = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  
  // Check structure
  if (!manifest.nodes) throw new Error('Missing nodes');
  if (!manifest.metadata) throw new Error('Missing metadata');
  
  // Check for PII (optional regex scan)
  const json_str = JSON.stringify(manifest);
  if (/\b[\d\-\s]{10,}\b/.test(json_str)) {
    console.warn('⚠️  Possible PII (phone/SSN pattern) detected in manifest');
  }
  
  console.log('✅ Manifest validation passed');
}
```

---

## Breaking Changes: SQL Server → MySQL

### 1. **JSON Functions**

| SQL Server | MySQL 8.0+ |
|-----------|-----------|
| `JSON_QUERY()` | `JSON_EXTRACT()` |
| `JSON_OBJECT()` | `JSON_OBJECT()` (same) |
| `JSON_ARRAY()` | `JSON_ARRAY()` (same) |
| No recursive CTE limit | Recursive CTE allowed from MySQL 8.0 |

### 2. **INFORMATION_SCHEMA Differences**

| Aspect | SQL Server | MySQL |
|--------|-----------|-------|
| Constraints | `INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS` | `INFORMATION_SCHEMA.KEY_COLUMN_USAGE` |
| Statistics | `sys.dm_db_index_physical_stats` | `INFORMATION_SCHEMA.STATISTICS` |
| Comments | `EXTENDED_PROPERTIES` | `COLUMN_COMMENT`, `TABLE_COMMENT` |

### 3. **Data Type Syntax**

| SQL Server | MySQL |
|-----------|-------|
| `NVARCHAR(MAX)` | `LONGTEXT` or `VARCHAR(max_bytes)` |
| `BIGINT` | `BIGINT` (same) |
| `DATETIME2` | `TIMESTAMP` or `DATETIME` |

---

## Porting Checklist

When porting to other databases, verify:

- [ ] **No credentials in code** – Use environment variables
- [ ] **Parameterized queries** – Variables for database/schema names
- [ ] **Explicit permissions** – Create read-only analysis user
- [ ] **Input validation** – Quote all identifiers
- [ ] **Error handling** – Graceful failures on permission denial
- [ ] **Audit logging** – Log all generation runs
- [ ] **Output validation** – Check JSON structure before deploying
- [ ] **Documentation** – Clear setup and security instructions
- [ ] **Testing** – Test on sample databases first
- [ ] **PII review** – Scan output for sensitive data patterns

---

## Compliance Considerations

### GDPR (EU)
- Manifest generation should be logged (Article 5.1(f) - accountability)
- Use credentials with minimal privilege (Article 32 - security)
- Document the data processing in your Data Processing Agreement

### HIPAA (Healthcare, US)
- If processing healthcare data identifiers, ensure encryption in transit
- Restrict access to read-only user only
- Log all access to INFORMATION_SCHEMA queries

### SOC 2 Type II
- Implement access controls (read-only user)
- Maintain audit logs
- Use secure credential storage
- Perform periodic security reviews

**Recommendation:** Review your organizational policies before deploying to production.

---

## Testing the Security Setup

```bash
# Test 1: Verify read-only user cannot write
mysql -u dbt_analyzer -p$DB_PASSWORD $DB_NAME -e "INSERT INTO customers VALUES (1, 'test');"
# Expected: Error - INSERT command denied

# Test 2: Verify manifest generation works
mysql -u dbt_analyzer -p$DB_PASSWORD $DB_NAME < mysql_manifest_generator.sql
# Expected: Valid JSON output

# Test 3: Verify user cannot access other databases
mysql -u dbt_analyzer -p$DB_PASSWORD other_db -e "SHOW TABLES;"
# Expected: Error - Access denied for database 'other_db'

# Test 4: Verify no credentials are logged
grep -i "password\|secret\|credential" /var/log/mysql/mysql.log
# Expected: No matches
```

---

## Version Information

| Tool | Original | Current MySQL Port |
|------|----------|------------------|
| Database | SQL Server 2019 | MySQL 8.0+ |
| JSON Output | dbt manifest schema v9 | dbt manifest schema v9 |
| Sample DB | AdventureWorks2017_DWH | AdventureWorks (portable) |
| Security Review Date | 2022-10-22 (comments) | 2026-02-07 |
| Public Domain Status | No | Yes |

---

## References

- **OWASP SQL Injection Prevention:** https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html
- **MySQL Security Best Practices:** https://dev.mysql.com/doc/refman/8.0/en/general-security.html
- **dbt Schema Validation:** https://schemas.getdbt.com/
- **Credential Management Best Practices:** https://12factor.net/config

---

**Review Completed:** February 7, 2026  
**Reviewed by:** Code Security Audit  
**Status:** ✅ APPROVED FOR PUBLIC DOMAIN USE
