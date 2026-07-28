-- LineageShield compatibility guard generated from DataHub MCP context.
-- Source: PROD.CRM.CUSTOMERS
-- Downstream consumers retain one migration window before plaintext removal.

create or replace view PROD.ANALYTICS.CUSTOMER_CONTACT_V2 as
select
    customer_id,
    lower(trim(email)) as email_legacy,
    sha2(lower(trim(email)), 256) as email_sha256
from PROD.CRM.CUSTOMERS;

-- Contract check: every populated legacy address must produce a stable hash.
select customer_id
from PROD.ANALYTICS.CUSTOMER_CONTACT_V2
where email_legacy is not null
  and email_sha256 is null;
