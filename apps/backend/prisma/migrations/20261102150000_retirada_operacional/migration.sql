-- Operational removal preserves all business records and immutable snapshots.
CREATE TABLE operational_retirements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ticket_id uuid UNIQUE REFERENCES tickets(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 service_id uuid UNIQUE REFERENCES services(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 category_id uuid UNIQUE REFERENCES service_categories(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 1000),
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 CONSTRAINT retirement_one_target CHECK(num_nonnulls(ticket_id,service_id,category_id)=1)
);
