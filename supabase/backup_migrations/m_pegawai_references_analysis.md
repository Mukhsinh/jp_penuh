# M_Pegawai References Analysis

## Overview
This document lists all references to `m_pegawai` table in the codebase that need to be updated to use `m_employees` instead.

## Database References

### Foreign Keys
1. **t_user.employee_id** → m_pegawai(id)
   - Location: `supabase/migrations/create_user_pegawai_tables.sql`
   - Action: Update to reference m_employees(id)

### Indexes
1. `idx_m_pegawai_employee_code` ON m_pegawai(employee_code)
2. `idx_m_pegawai_unit_id` ON m_pegawai(unit_id)
3. `idx_m_pegawai_full_name` ON m_pegawai(full_name)
4. `idx_m_pegawai_is_active` ON m_pegawai(is_active)
   - Action: Drop these indexes (m_employees already has equivalent indexes)

### RLS Policies
1. "Superadmin can view all pegawai" ON m_pegawai
2. "Superadmin can insert pegawai" ON m_pegawai
3. "Superadmin can update pegawai" ON m_pegawai
4. "Superadmin can delete pegawai" ON m_pegawai
5. "Unit managers can view their unit pegawai" ON m_pegawai
6. "Unit managers can insert pegawai in their unit" ON m_pegawai
7. "Unit managers can update their unit pegawai" ON m_pegawai
8. "Employees can view their own pegawai record" ON m_pegawai
   - Action: Drop these policies (m_employees already has equivalent policies)

## Code References

### Services
1. **lib/services/pegawai.service.ts**
   - All queries use `from('m_pegawai')`
   - Action: Replace with `from('m_employees')`

2. **lib/services/user-management.service.ts**
   - Line 45: `pegawai:m_pegawai(`
   - Action: Replace with `m_employees(`

### Components
1. **components/pegawai/PegawaiFormDialog.tsx**
   - Line 69: `.from('m_pegawai')`
   - Action: Replace with `.from('m_employees')`

2. **components/pegawai/PegawaiTable.tsx**
   - No direct database queries (uses service)
   - Action: No changes needed

3. **components/users/UserFormDialog.tsx**
   - Line 69: `.from('m_pegawai')`
   - Action: Replace with `.from('m_employees')`

### Pages
1. **app/admin/pegawai/page.tsx**
   - Uses pegawai.service.ts
   - Action: No changes needed (service will be updated)

2. **app/admin/pegawai/actions.ts**
   - Line 35: `.from('m_pegawai')`
   - Action: Replace with `.from('m_employees')`

3. **app/admin/users/actions.ts**
   - Line 68: `pegawai:m_pegawai!employee_id(`
   - Action: Replace with `m_employees!employee_id(`

### Types
1. **lib/types/database.types.ts**
   - Line 41: `m_pegawai: {`
   - Action: Remove m_pegawai type definition (use m_employees instead)

### Migrations
1. **supabase/migrations/create_user_pegawai_tables.sql**
   - Creates m_pegawai table
   - Action: Mark as deprecated, do not run on new installations

## Summary

### Files to Update (9 files)
1. lib/services/pegawai.service.ts
2. lib/services/user-management.service.ts
3. components/pegawai/PegawaiFormDialog.tsx
4. components/users/UserFormDialog.tsx
5. app/admin/pegawai/actions.ts
6. app/admin/users/actions.ts
7. lib/types/database.types.ts
8. supabase/migrations/create_user_pegawai_tables.sql (mark as deprecated)

### Database Objects to Drop
1. Table: m_pegawai
2. Indexes: 4 indexes
3. RLS Policies: 8 policies
4. Triggers: 1 trigger (update_m_pegawai_updated_at)

### Foreign Keys to Update
1. t_user.employee_id → Update to reference m_employees(id)

## Migration Steps
1. ✅ Create backup of m_pegawai
2. ✅ Copy unique records to m_employees
3. ✅ Update foreign key constraints
4. ⏳ Update application code
5. ⏳ Test all CRUD operations
6. ⏳ Drop m_pegawai table
7. ⏳ Verify migration success

## Rollback Plan
If migration fails:
1. Restore m_pegawai from m_pegawai_backup
2. Restore foreign key constraints
3. Restore RLS policies
4. Revert code changes
