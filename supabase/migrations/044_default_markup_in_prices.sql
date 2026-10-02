-- Quotation templates now include the markup inside each price by default (no separate "service fee" row).
-- Existing templates that never chose a style, or still use the old default, are switched to it.
UPDATE quotation_templates
SET options = COALESCE(options, '{}'::jsonb) || '{"charges_style":"marked_up"}'::jsonb
WHERE COALESCE(options->>'charges_style', 'detailed') = 'detailed';
