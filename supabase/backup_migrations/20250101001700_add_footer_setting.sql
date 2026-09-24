-- Add footer setting to t_settings table
INSERT INTO t_settings (key, value, description) VALUES
  ('footer', '{"text": "© 2026 JASPEL Enterprise - All Rights Reserved"}', 'Footer text for application')
ON CONFLICT (key) DO NOTHING;
