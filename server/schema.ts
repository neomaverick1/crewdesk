// PostgreSQL schema. Money is stored in cents and times as timestamptz.
export const SCHEMA = /* sql */ `
create table users (
  id serial primary key,
  name text not null,
  email text not null unique,
  role text not null check (role in ('owner', 'dispatcher', 'technician')),
  password_hash text not null,
  color text not null default '#4f46e5',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table customers (
  id serial primary key,
  name text not null,
  email text,
  phone text,
  address text not null,
  city text not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index customers_name_idx on customers (lower(name));

create sequence job_numbers start 1001;
create table jobs (
  id serial primary key,
  number text not null unique,
  customer_id int not null references customers (id),
  title text not null,
  description text not null default '',
  status text not null default 'new' check (status in ('new', 'scheduled', 'in_progress', 'done', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'urgent')),
  technician_id int references users (id),
  scheduled_at timestamptz,
  duration_minutes int not null default 60 check (duration_minutes between 15 and 600),
  estimate_cents int not null default 0 check (estimate_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index jobs_scheduled_idx on jobs (scheduled_at);
create index jobs_technician_idx on jobs (technician_id, scheduled_at);
create index jobs_customer_idx on jobs (customer_id);

create sequence invoice_numbers start 2001;
create table invoices (
  id serial primary key,
  number text not null unique,
  customer_id int not null references customers (id),
  job_id int references jobs (id),
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'void')),
  tax_bps int not null default 0 check (tax_bps between 0 and 5000),
  subtotal_cents int not null default 0,
  tax_cents int not null default 0,
  total_cents int not null default 0,
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index invoices_customer_idx on invoices (customer_id);
create unique index invoices_job_idx on invoices (job_id) where status <> 'void';

create table invoice_lines (
  id serial primary key,
  invoice_id int not null references invoices (id) on delete cascade,
  position int not null,
  description text not null,
  quantity double precision not null check (quantity > 0),
  unit_cents int not null check (unit_cents >= 0)
);

create table activity (
  id serial primary key,
  user_id int references users (id),
  job_id int references jobs (id) on delete set null,
  subject text not null,
  message text not null,
  created_at timestamptz not null default now()
);
create index activity_created_idx on activity (created_at desc);
`;
