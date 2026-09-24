-- Fix can_assess_employee function to use user_id instead of email

CREATE OR REPLACE FUNCTION can_assess_employee(employee_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Get current user's employee record
  DECLARE
    current_user_employee m_employees%ROWTYPE;
    target_employee m_employees%ROWTYPE;
  BEGIN
    -- Get current user's employee data using user_id
    SELECT * INTO current_user_employee 
    FROM m_employees 
    WHERE user_id = auth.uid() 
    AND is_active = true;
    
    -- If no employee record found, deny access
    IF NOT FOUND THEN
      RETURN FALSE;
    END IF;
    
    -- Superadmin can assess anyone
    IF current_user_employee.role = 'superadmin' THEN
      RETURN TRUE;
    END IF;
    
    -- Unit managers can only assess employees in their unit
    IF current_user_employee.role = 'unit_manager' THEN
      SELECT * INTO target_employee 
      FROM m_employees 
      WHERE id = employee_uuid;
      
      IF FOUND AND target_employee.unit_id = current_user_employee.unit_id THEN
        RETURN TRUE;
      END IF;
    END IF;
    
    RETURN FALSE;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;