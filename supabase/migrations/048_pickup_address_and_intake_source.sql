-- EXW pickup address + how a request / quote entered the system.
alter table freight_requests add column if not exists pickup_address text;
alter table freight_requests add column if not exists intake_source text not null default 'automatic';
alter table freight_requests add column if not exists intake_filename text;

alter table carrier_quotes add column if not exists pickup_address text;
alter table carrier_quotes add column if not exists intake_source text not null default 'automatic';
alter table carrier_quotes add column if not exists intake_filename text;
