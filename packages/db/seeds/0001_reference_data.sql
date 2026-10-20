-- Starting reference data from the spec. All of it is editable later.
INSERT INTO trade_types (slug, name, position) VALUES
  ('painting_decorating',  'Painting and decorating', 1),
  ('exterior_restoration', 'Exterior restoration',    2)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO lead_sources (slug, name) VALUES
  ('google_ads',        'Google Ads'),
  ('facebook_lead_ads', 'Facebook Lead Ads'),
  ('phone',             'Phone')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO statuses (slug, name, position, is_default, makes_contact, creates_customer, follow_up_eligible) VALUES
  ('uncontacted',        'Uncontacted',        1, true,  false, false, false),
  ('waiting_for_images', 'Waiting for images', 2, false, true,  false, true),
  ('quoted',             'Quoted',             3, false, false, false, false),
  ('booked',             'Booked',             4, false, false, true,  false)
ON CONFLICT (slug) DO NOTHING;

-- Spec's example follow-up, seeded switched off until WhatsApp integration is decided.
INSERT INTO automations (name, description, enabled, trigger_status_id, delay_hours, action_type, action_config)
SELECT 'Waiting for images: WhatsApp nudge',
       'Ask for photos if the lead is still in Waiting for images after the delay.',
       false, id, 24, 'whatsapp_message',
       '{"template": "Hi {{first_name}}, just checking in - could you send over some photos of the job when you get a moment?"}'
FROM statuses WHERE slug = 'waiting_for_images'
AND NOT EXISTS (SELECT 1 FROM automations WHERE name = 'Waiting for images: WhatsApp nudge');
