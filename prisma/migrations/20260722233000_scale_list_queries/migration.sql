DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pg_trgm'
  ) AND NOT has_database_privilege(current_user, current_database(), 'CREATE') THEN
    RAISE EXCEPTION
      'The deployment role needs CREATE on database % to install pg_trgm',
      current_database();
  END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- The indexes for these query paths are installed by `npm run db:indexes`.
-- PostgreSQL does not allow CREATE INDEX CONCURRENTLY inside the transaction
-- used by Prisma migrations.
