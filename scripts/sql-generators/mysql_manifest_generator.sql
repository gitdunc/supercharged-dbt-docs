/**
 * MySQL Manifest Generator for dbt-docs Visualization
 * 
 * DESCRIPTION:
 *   Extracts database schema metadata (tables, columns, relationships) from MySQL
 *   and generates a manifest.json compatible structure for supercharged-dbt-docs.
 * 
 * USAGE:
 *   mysql -u user -p database < mysql_manifest_generator.sql > manifest.json
 * 
 * REQUIREMENTS:
 *   - MySQL 8.0+
 *   - SELECT permissions on INFORMATION_SCHEMA
 * 
 * SECURITY NOTES:
 *   - No credentials stored in this script
 *   - No PII extracted (only schema metadata)
 *   - Use read-only database connection
 * 
 * OUTPUT:
 *   JSON with nodes, sources, _childIndex structure
 * 
 * AUTHOR: Generated for public domain
 * DATE: 2026-02-07
 */

-- ============================================================================
-- CONFIGURATION
-- ============================================================================
SET @DATABASE_NAME = 'adventureworks'; -- CHANGE THIS to your database name

-- ============================================================================
-- STEP 1: Extract Table Metadata
-- ============================================================================
-- This CTE gathers all tables and their column definitions from INFORMATION_SCHEMA

WITH table_data AS (
  SELECT 
    CONCAT('model.', LOWER(TABLE_SCHEMA), '.', LOWER(TABLE_NAME)) AS unique_id,
    TABLE_NAME,
    TABLE_SCHEMA,
    TABLE_TYPE,
    COALESCE(TABLE_COMMENT, CONCAT(TABLE_NAME, ' table')) AS description,
    CREATE_TIME
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @DATABASE_NAME AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
),

col_data AS (
  SELECT 
    CONCAT('model.', LOWER(TABLE_SCHEMA), '.', LOWER(TABLE_NAME)) AS unique_id,
    LOWER(COLUMN_NAME) AS col_name,
    ORDINAL_POSITION AS col_ord,
    COLUMN_TYPE AS col_type,
    COALESCE(COLUMN_COMMENT, '') AS col_desc
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @DATABASE_NAME
)

SELECT JSON_OBJECT(
  'metadata', JSON_OBJECT(
    'dbt_schema_version', 'https://schemas.getdbt.com/dbt/manifest/v9.json',
    'dbt_version', '1.0.0',
    'generated_at', DATE_FORMAT(NOW(), '%Y-%m-%dT%H:%i:%sZ'),
    'invocation_id', UUID(),
    'env', 'production'
  ),
  'nodes', COALESCE(
    JSON_OBJECTAGG(
      t.unique_id,
      JSON_OBJECT(
        'name', t.TABLE_NAME,
        'description', t.description,
        'database', @DATABASE_NAME,
        'schema', t.TABLE_SCHEMA,
        'resource_type', IF(t.TABLE_TYPE = 'VIEW', 'view', 'table'),
        'unique_id', t.unique_id,
        'created_at', UNIX_TIMESTAMP(t.CREATE_TIME),
        'depends_on', JSON_ARRAY(),
        'columns', COALESCE(
          (SELECT JSON_OBJECTAGG(
            c.col_name,
            JSON_OBJECT(
              'name', c.col_name,
              'description', c.col_desc,
              'data_type', c.col_type,
              'index', c.col_ord
            )
          ) FROM col_data c WHERE c.unique_id = t.unique_id),
          JSON_OBJECT()
        ),
        'config', JSON_OBJECT(
          'materialized', IF(t.TABLE_TYPE = 'VIEW', 'view', 'table'),
          'tags', JSON_ARRAY('auto-generated')
        )
      )
    ),
    JSON_OBJECT()
  ),
  'sources', JSON_OBJECT(),
  '_childIndex', JSON_OBJECT()
) AS manifest_json
FROM table_data t;

-- ============================================================================
-- OUTPUT: Execute SELECT above and save result to manifest.json file
-- ============================================================================
-- Use your application to:
-- 1. Execute this query
-- 2. Extract the manifest_json column value
-- 3. Write to public/manifest.json
-- 4. Format with proper indentation (optional but recommended)
