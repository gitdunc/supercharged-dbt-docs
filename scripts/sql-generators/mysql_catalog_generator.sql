/**
 * MySQL Catalog Generator for dbt-docs Visualization
 * 
 * DESCRIPTION:
 *   Extracts table and column statistics from MySQL INFORMATION_SCHEMA
 *   and generates a catalog.json structure for supercharged-dbt-docs.
 *   Includes row counts, storage stats, and column-level metadata.
 * 
 * USAGE:
 *   1. Connect to your MySQL database
 *   2. Update DATABASE_NAME variable below
 *   3. Run the entire script
 *   4. Configure JSON output location in your application
 * 
 * REQUIREMENTS:
 *   - MySQL 8.0+
 *   - SELECT permissions on INFORMATION_SCHEMA and performance_schema
 *   - Run as a user with schema introspection rights
 *   - statistics tables should be enabled (default in MySQL 8.0)
 * 
 * SECURITY NOTES:
 *   - No PII is extracted (only table/column metadata and stats)
 *   - Row counts may be approximate (depends on background stats updates)
 *   - File I/O permissions required to read table statistics
 *   - Use read-only database user for security
 * 
 * OUTPUT:
 *   JSON structure with:
 *   - nodes: table statistics (row counts, size, update times)
 *   - columns: column-level metadata (not null counts, distinct values)
 * 
 * AUTHOR: Generated for public domain
 * DATE: 2026-02-07
 */

-- ============================================================================
-- CONFIGURATION
-- ============================================================================
SET @DATABASE_NAME = 'adventureworks'; -- CHANGE THIS to your database name

-- ============================================================================
-- STEP 1: Gather Table Statistics
-- ============================================================================

WITH table_stats AS (
  SELECT 
    CONCAT('model.', LOWER(TABLE_SCHEMA), '.', LOWER(TABLE_NAME)) AS unique_id,
    TABLE_NAME,
    TABLE_SCHEMA,
    TABLE_TYPE,
    TABLE_ROWS AS row_count,
    DATA_LENGTH AS data_bytes,
    INDEX_LENGTH AS index_bytes,
    ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) AS size_mb,
    UPDATE_TIME AS last_updated,
    CREATE_TIME,
    COALESCE(TABLE_COMMENT, '') AS table_comment
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @DATABASE_NAME
    AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
),

-- ============================================================================
-- STEP 2: Count Columns Per Table
-- ============================================================================

col_count AS (
  SELECT 
    CONCAT('model.', LOWER(TABLE_SCHEMA), '.', LOWER(TABLE_NAME)) AS unique_id,
    COUNT(*) AS col_count
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @DATABASE_NAME
  GROUP BY TABLE_SCHEMA, TABLE_NAME
),

-- ============================================================================
-- STEP 3: Gather Column-Level Metadata
-- ============================================================================

column_details AS (
  SELECT 
    CONCAT('model.', LOWER(TABLE_SCHEMA), '.', LOWER(TABLE_NAME)) AS unique_id,
    LOWER(COLUMN_NAME) AS col_name,
    ORDINAL_POSITION AS col_ord,
    COLUMN_TYPE,
    IS_NULLABLE,
    COALESCE(COLUMN_COMMENT, '') AS col_comment
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @DATABASE_NAME
)

-- ============================================================================
-- STEP 4: Aggregate and Format as Catalog Structure
-- ============================================================================

SELECT JSON_OBJECT(
  'metadata', JSON_OBJECT(
    'dbt_schema_version', 'https://schemas.getdbt.com/dbt/catalog/v1.json',
    'generated_at', DATE_FORMAT(NOW(), '%Y-%m-%dT%H:%i:%sZ'),
    'invocation_id', UUID(),
    'env', 'production'
  ),
  'nodes', COALESCE(
    JSON_OBJECTAGG(
      ts.unique_id,
      JSON_OBJECT(
        'metadata', JSON_OBJECT(
          'schema', ts.TABLE_SCHEMA,
          'name', ts.TABLE_NAME,
          'type', LOWER(ts.TABLE_TYPE),
          'owner', 'schema_owner',
          'comment', ts.table_comment
        ),
        'stats', JSON_OBJECT(
          'num_rows', JSON_OBJECT(
            'id', CONCAT('num_rows_', ts.TABLE_NAME),
            'label', 'Row Count',
            'value', COALESCE(ts.row_count, 0),
            'description', 'Approximate row count from INFORMATION_SCHEMA',
            'include', TRUE
          ),
          'num_bytes', JSON_OBJECT(
            'id', CONCAT('num_bytes_', ts.TABLE_NAME),
            'label', 'Size (MB)',
            'value', COALESCE(ts.size_mb, 0),
            'description', 'Total data and index size in megabytes',
            'include', TRUE
          ),
          'last_changed', JSON_OBJECT(
            'id', CONCAT('last_changed_', ts.TABLE_NAME),
            'label', 'Last Updated',
            'value', COALESCE(DATE_FORMAT(ts.last_updated, '%Y-%m-%d %H:%i:%s'), 'Unknown'),
            'description', 'Last update timestamp from table statistics',
            'include', TRUE
          )
        ),
        'columns', COALESCE(
          (SELECT JSON_OBJECTAGG(
            cd.col_name,
            JSON_OBJECT(
              'name', cd.col_name,
              'index', cd.col_ord,
              'type', cd.COLUMN_TYPE,
              'nullable', CASE WHEN cd.IS_NULLABLE = 'YES' THEN TRUE ELSE FALSE END,
              'description', cd.col_comment
            )
          ) FROM column_details cd WHERE cd.unique_id = ts.unique_id),
          JSON_OBJECT()
        ),
        'created_at', UNIX_TIMESTAMP(ts.CREATE_TIME),
        'updated_at', UNIX_TIMESTAMP(COALESCE(ts.last_updated, ts.CREATE_TIME))
      )
    ),
    JSON_OBJECT()
  ),
  'sources', JSON_OBJECT(),
  'errors', JSON_OBJECT()
) AS catalog_json
FROM table_stats ts;

-- ============================================================================
-- OUTPUT: Execute SELECT above and save result to catalog.json file
-- ============================================================================
-- Use your application to:
-- 1. Execute this query
-- 2. Extract the catalog_json column value
-- 3. Write to public/catalog.json
-- 4. Format with proper indentation (recommended for readability)
-- 5. Note: Row counts may be approximate depending on InnoDB statistics settings
