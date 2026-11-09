-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('INSERT', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "tableName" TEXT NOT NULL,
    "recordId" TEXT,
    "action" "AuditAction" NOT NULL,
    "changedColumns" TEXT[],
    "oldData" JSONB,
    "newData" JSONB,
    "actorUserId" INTEGER,
    "txId" BIGINT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_tableName_recordId_idx" ON "AuditLog"("tableName", "recordId");

-- CreateIndex
CREATE INDEX "AuditLog_changedAt_idx" ON "AuditLog"("changedAt");

-- Історія змін: тригер на кожну таблицю пише в "AuditLog" рядок до і після зміни.
-- Аргументи тригера: TG_ARGV[0] — колонки первинного ключа через кому,
-- TG_ARGV[1] — колонки, значення яких не зберігаються (напр. passwordHash).
-- Хто змінив — із налаштування транзакції app.actor_id (його ставить withActor у src/config/audit.js).
CREATE FUNCTION audit_row_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    pk_columns TEXT[] := string_to_array(TG_ARGV[0], ',');
    hidden TEXT[] := CASE WHEN TG_NARGS > 1 AND TG_ARGV[1] <> '' THEN string_to_array(TG_ARGV[1], ',') ELSE ARRAY[]::TEXT[] END;
    full_old JSONB;
    full_new JSONB;
    key_row JSONB;
    changed TEXT[];
    record_id TEXT;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        full_old := to_jsonb(OLD);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        full_new := to_jsonb(NEW);
    END IF;

    IF TG_OP = 'UPDATE' THEN
        SELECT array_agg(n.key ORDER BY n.key) INTO changed
        FROM jsonb_each(full_new) AS n
        WHERE n.value IS DISTINCT FROM full_old -> n.key;
        IF changed IS NULL THEN
            RETURN NULL; -- UPDATE без змін не пишемо
        END IF;
    ELSE
        SELECT array_agg(k ORDER BY k) INTO changed FROM jsonb_object_keys(COALESCE(full_new, full_old)) AS k;
    END IF;

    key_row := COALESCE(full_new, full_old);
    SELECT string_agg(key_row ->> col, ':' ORDER BY ord) INTO record_id
    FROM unnest(pk_columns) WITH ORDINALITY AS pk(col, ord);

    INSERT INTO "AuditLog" ("tableName", "recordId", "action", "changedColumns", "oldData", "newData", "actorUserId", "txId", "changedAt")
    VALUES (
        TG_TABLE_NAME,
        record_id,
        TG_OP::"AuditAction",
        changed,
        full_old - hidden,
        full_new - hidden,
        NULLIF(current_setting('app.actor_id', true), '')::INTEGER,
        txid_current(),
        clock_timestamp() AT TIME ZONE 'UTC'
    );
    RETURN NULL;
END;
$$;

-- Вмикає історію для таблиці. Кожна нова таблиця в наступних міграціях теж має викликати
-- SELECT enable_audit('"НоваТаблиця"'); (тест tests/integration/audit.db.test.js це перевіряє)
CREATE FUNCTION enable_audit(target REGCLASS, pk_columns TEXT[] DEFAULT ARRAY['id'], hidden_columns TEXT[] DEFAULT ARRAY[]::TEXT[]) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE format(
        'CREATE OR REPLACE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION audit_row_change(%L, %L)',
        target,
        array_to_string(pk_columns, ','),
        array_to_string(hidden_columns, ',')
    );
END;
$$;

-- Історію не можна переписати чи стерти
CREATE FUNCTION audit_log_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'AuditLog is append-only: % is not allowed', TG_OP;
END;
$$;

CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

-- Історія для всіх наявних таблиць
SELECT enable_audit('"User"', ARRAY['id'], ARRAY['passwordHash']);
SELECT enable_audit('"Parent"');
SELECT enable_audit('"Child"');
SELECT enable_audit('"ParentChild"', ARRAY['parentId', 'childId']);
SELECT enable_audit('"Room"');
SELECT enable_audit('"Group"');
SELECT enable_audit('"Staff"');
SELECT enable_audit('"Club"');
SELECT enable_audit('"ScheduleSlot"');
SELECT enable_audit('"Setting"', ARRAY['key']);
