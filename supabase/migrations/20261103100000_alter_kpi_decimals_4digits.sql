-- Migration to support 4 decimal places for base_index_value, unit_tariff, target_value, and assessment scores
ALTER TABLE m_kpi_indicators 
    ALTER COLUMN base_index_value TYPE NUMERIC(15,4),
    ALTER COLUMN unit_tariff TYPE NUMERIC(15,4),
    ALTER COLUMN target_value TYPE NUMERIC(15,4);

ALTER TABLE m_kpi_sub_indicators 
    ALTER COLUMN base_index_value TYPE NUMERIC(15,4),
    ALTER COLUMN unit_tariff TYPE NUMERIC(15,4),
    ALTER COLUMN target_value TYPE NUMERIC(15,4);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 't_kpi_assessments') THEN
        ALTER TABLE t_kpi_assessments 
            ALTER COLUMN realization_value TYPE NUMERIC(15,4),
            ALTER COLUMN score TYPE NUMERIC(15,4),
            ALTER COLUMN target_value TYPE NUMERIC(15,4);
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 't_realization') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 't_realization' AND column_name = 'realization_value') THEN
            ALTER TABLE t_realization ALTER COLUMN realization_value TYPE NUMERIC(15,4);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 't_realization' AND column_name = 'score') THEN
            ALTER TABLE t_realization ALTER COLUMN score TYPE NUMERIC(15,4);
        END IF;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';

